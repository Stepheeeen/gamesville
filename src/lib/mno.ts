/**
 * MNO / aggregator callback parsing — shared by the subscription webhook.
 *
 * The aggregator (NasVille, MTN datasync) payload shape isn't pinned down
 * yet, so this accepts JSON, form-encoded and XML bodies and looks for the
 * usual field names, including nested ones (e.g. `userID.ID`).
 */

export type MnoAction = 'subscribe' | 'unsubscribe' | 'unknown';

export interface ParsedCallback {
  /** Flattened, lower-cased key → value map of every leaf in the body. */
  fields: Record<string, string>;
  raw: string;
  msisdn: string | null;
  serviceId: string | null;
  action: MnoAction;
}

const MSISDN_KEYS = ['msisdn', 'phone', 'subscriber', 'number', 'userid.id', 'userid', 'user_id', 'mobile'];
const SERVICE_KEYS = ['serviceid', 'service_id', 'productid', 'product_id', 'service'];
const EVENT_KEYS = ['event', 'updatedesc', 'updatetype', 'action', 'type', 'status', 'operation'];

const SUBSCRIBE = new Set([
  'subscribed', 'subscribe', 'subscription', 'activated', 'activation', 'renewed', 'renewal',
  'addition', 'add', 'billed', 'success', '1', '3', 'modification',
]);
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
  }
  // A bare notification with a number and no event is treated as a subscription.
  if (action === 'unknown' && msisdn && !EVENT_KEYS.some((k) => pick(fields, [k]))) action = 'subscribe';

  return { fields, raw: body.slice(0, 10_000), msisdn, serviceId: pick(fields, SERVICE_KEYS), action };
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
