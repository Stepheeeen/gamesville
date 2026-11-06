/**
 * MNO / aggregator integration — callback parsing and outbound SMS.
 *
 * NasVille's Kitten router sends billing sync as GET query params
 * (action=Addition|Modification|Deletion, msisdn, pcode, expirydate…), but
 * JSON, form-encoded and XML bodies are accepted too, including nested
 * field names (e.g. `userID.ID`).
 */

export type MnoAction = 'subscribe' | 'renew' | 'unsubscribe' | 'unknown';

export interface ParsedCallback {
  /** Flattened, lower-cased key → value map of every leaf in the body. */
  fields: Record<string, string>;
  raw: string;
  msisdn: string | null;
  serviceId: string | null;
  action: MnoAction;
  /** Subscription expiry from the aggregator (`expirydate`, yyyyMMddHHmmss). */
  expiresAt: Date | null;
}

const MSISDN_KEYS = ['msisdn', 'phone', 'subscriber', 'number', 'userid.id', 'userid', 'user_id', 'mobile'];
const SERVICE_KEYS = ['pcode', 'serviceid', 'service_id', 'productid', 'product_id', 'service'];
const EVENT_KEYS = ['event', 'updatedesc', 'updatetype', 'action', 'type', 'status', 'operation'];

const SUBSCRIBE = new Set([
  'subscribed', 'subscribe', 'subscription', 'activated', 'activation', 'addition', 'add', 'success', '1',
]);
// Kitten: Modification == renewal of an existing subscription
const RENEW = new Set(['renewed', 'renewal', 'modification', 'billed', '3']);
const UNSUBSCRIBE = new Set([
  'cancelled', 'canceled', 'cancel', 'expired', 'unsubscribed', 'unsubscribe', 'unsubscription',
  'deletion', 'delete', 'deactivated', 'deactivation', 'stop', '2',
]);

function flatten(obj: unknown, prefix: string, out: Record<string, string>) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') {
    out[prefix.toLowerCase()] = String(obj);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = k.replace(/^.*:/, ''); // drop XML namespace prefixes
    flatten(v, prefix ? `${prefix}.${key}` : key, out);
  }
}

/** Leaf elements of an XML/SOAP body, keyed by tag name (namespace stripped). */
function xmlLeaves(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, tag, value] of xml.matchAll(/<([\w:.-]+)[^>/]*>([^<]*)<\/\1>/g)) {
    out[tag.replace(/^.*:/, '').toLowerCase()] = value.trim();
  }
  // MTN datasync nests the subscriber as <userID><ID>234…</ID><type>0</type></userID>
  const user = xml.match(/<(?:\w+:)?userID>[\s\S]*?<(?:\w+:)?ID>([^<]*)</i);
  if (user) out['userid.id'] = user[1].trim();
  // …and extra attributes as <key>k</key><value>v</value> pairs under extensionInfo
  for (const [, k, v] of xml.matchAll(/<(?:\w+:)?key>([^<]*)<\/(?:\w+:)?key>\s*<(?:\w+:)?value>([^<]*)</g)) {
    out[k.trim().toLowerCase()] = v.trim();
  }
  return out;
}

function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const want of keys) {
    for (const [k, v] of Object.entries(fields)) {
      if ((k === want || k.endsWith('.' + want)) && v.trim()) return v.trim();
    }
  }
  return null;
}

export function parseCallback(raw: string, contentType: string, query: URLSearchParams): ParsedCallback {
  const fields: Record<string, string> = {};
  query.forEach((v, k) => (fields[k.toLowerCase()] = v));

  const body = raw.trim();
  if (body.startsWith('{') || body.startsWith('[') || contentType.includes('json')) {
    try {
      flatten(JSON.parse(body), '', fields);
    } catch {
      /* not JSON after all */
    }
  } else if (body.startsWith('<')) {
    Object.assign(fields, xmlLeaves(body));
  } else if (body) {
    new URLSearchParams(body).forEach((v, k) => (fields[k.toLowerCase()] = v));
  }

  const rawMsisdn = pick(fields, MSISDN_KEYS);
  const digits = rawMsisdn?.replace(/\D/g, '') ?? '';
  const msisdn = digits.length >= 10 ? normaliseMsisdn(digits) : null;

  let action: MnoAction = 'unknown';
  for (const key of EVENT_KEYS) {
    const v = pick(fields, [key])?.toLowerCase();
    if (!v) continue;
    if (UNSUBSCRIBE.has(v)) { action = 'unsubscribe'; break; }
    if (SUBSCRIBE.has(v)) { action = 'subscribe'; break; }
    if (RENEW.has(v)) { action = 'renew'; break; }
  }
  // A bare notification with a number and no event is treated as a subscription.
  if (action === 'unknown' && msisdn && !EVENT_KEYS.some((k) => pick(fields, [k]))) action = 'subscribe';

  return {
    fields,
    raw: body.slice(0, 10_000),
    msisdn,
    serviceId: pick(fields, SERVICE_KEYS),
    action,
    expiresAt: parseKittenDate(pick(fields, ['expirydate', 'expirytime', 'expiry'])),
  };
}

/** Kitten timestamps are yyyyMMddHHmmss in UTC (requestdate matches our receive time). */
export function parseKittenDate(raw: string | null): Date | null {
  const m = raw?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Nigerian numbers → +234XXXXXXXXXX (accepts 080…, 80…, 234…, +234…). */
export function normaliseMsisdn(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);
  else if (d.length === 10) d = '234' + d;
  return '+' + d;
}

export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for')?.split(',')[0] ?? headers.get('x-real-ip') ?? '').trim();
}

/**
 * True when the caller sent our own `x-webhook-secret` (WEBHOOK_SECRET).
 * Callbacks are processed either way; only our own callers get the access
 * code echoed back, so an outsider can never read a subscriber's code.
 */
export function hasOwnSecret(headers: Headers): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  return !!secret && headers.get('x-webhook-secret') === secret;
}

// ── Outbound SMS (Kitten router) ──────────────────────────────────────────────

export interface SmsResult {
  ok: boolean;
  status: number | null;
  body: string;
}

/**
 * Send an SMS through the Kitten router's /sendsms, authenticated with the
 * CPID and X-TOKEN headers. Never throws — failures come back as `ok: false`.
 */
export async function sendSms(msisdn: string, serviceId: string, message: string): Promise<SmsResult> {
  const cpid = process.env.KITTEN_CPID;
  const token = process.env.KITTEN_XTOKEN;
  if (!cpid || !token) return { ok: false, status: null, body: 'KITTEN_CPID / KITTEN_XTOKEN not configured' };

  const host = (process.env.KITTEN_HOST ?? 'http://89.107.62.249:8101/').replace(/\/?$/, '/');
  try {
    const res = await fetch(host + 'sendsms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', CPID: cpid, 'X-TOKEN': token },
      body: JSON.stringify({
        SrcAddr: process.env.MNO_SHORTCODE ?? '20260',
        DestAddr: msisdn.replace(/\D/g, ''),
        ServiceID: serviceId,
        Message: message,
        msgtype: 'SMS',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.text()).slice(0, 1000);
    let ok = res.ok;
    try {
      ok = res.ok && JSON.parse(body).status === true;
    } catch {
      /* non-JSON reply — trust the HTTP status */
    }
    return { ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: null, body: String(err) };
  }
}

// ── Access gating ─────────────────────────────────────────────────────────────

/** Slack past the billed expiry so a late renewal callback doesn't lock anyone out. */
const RENEWAL_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * True when the carrier subscription has ended: cancelled by billing sync,
 * or past its expiry (plus grace). Accounts with no subscription record —
 * QA/demo accounts and users from before billing sync — are not gated.
 */
export function subscriptionLapsed(
  sub: { status?: string | null; expiresAt?: Date | string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!sub) return false;
  if (sub.status === 'cancelled') return true;
  return !!sub.expiresAt && new Date(sub.expiresAt).getTime() + RENEWAL_GRACE_MS < now;
}
