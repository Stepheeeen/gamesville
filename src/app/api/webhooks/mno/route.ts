/**
 * MNO Subscription Webhook — Gamesville
 * GET/POST /api/webhooks/mno — NasVille Kitten "Billing Sync" callback
 *
 *   Addition     → issue a fresh 6-digit access code (create the user if new)
 *                  and SMS it to the subscriber via Kitten /sendsms
 *   Modification → renewal: extend the subscription (no new code)
 *   Deletion     → revoke the access code and pass, mark the subscription cancelled
 *
 * The aggregator gets "Bill Sync OK" straight away; the SMS and the
 * logMnoEvent audit record are written after the response. Only our own
 * x-webhook-secret gets the access code echoed back in the response.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { getUserByPhone, createUser, updateUser, cancelPass, logMnoEvent, type Subscription } from '@/lib/db';
import { clientIp, hasOwnSecret, parseCallback, sendSms, type SmsResult } from '@/lib/mno';

const CODE_TTL_MS = 48 * 60 * 60 * 1000;
const DEFAULT_SERVICE_ID = '2661'; // GAMES VILLE DAILY

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function welcomeSms(code: string): string {
  return `Welcome to Games Ville! Your access code is ${code}. Log in at gamesville.games with your number. Code expires in 48hrs.`;
}

/** Run after the response when inside a request; inline otherwise (tests). */
function later(fn: () => Promise<void>) {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

async function handle(req: NextRequest) {
  const raw = req.method === 'POST' ? await req.text() : '';
  const cb = parseCallback(raw, req.headers.get('content-type') ?? '', req.nextUrl.searchParams);
  const ownSecret = hasOwnSecret(req.headers);
  const serviceId = cb.serviceId ?? DEFAULT_SERVICE_ID;

  let outcome = 'logged';
  let code: string | null = null;

  try {
    if (cb.msisdn && cb.action !== 'unknown') {
      const phone = cb.msisdn;
      const subscription = (status: Subscription['status']): Subscription => ({
        serviceId,
        status,
        expiresAt: cb.expiresAt?.toISOString() ?? null,
        updatedAt: new Date().toISOString(),
      });
      const existing = await getUserByPhone(phone);

      if (cb.action === 'unsubscribe') {
        await updateUser(phone, { tempCode: null, tempCodeExpires: null, subscription: subscription('cancelled') });
        await cancelPass(phone);
        outcome = 'unsubscribed';
      } else if (cb.action === 'renew' && existing) {
        await updateUser(phone, { subscription: subscription('active') });
        outcome = 'renewed';
      } else {
        // Addition — or a renewal for someone we never saw subscribe.
        code = generate6DigitCode();
        if (existing) {
          await updateUser(phone, {
            tempCode: code,
            tempCodeExpires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
            subscription: subscription('active'),
          });
          outcome = 'resubscribed';
        } else {
          await createUser(phone, code, CODE_TTL_MS);
          await updateUser(phone, { subscription: subscription('active') });
          outcome = 'subscribed';
        }
      }
    } else {
      outcome = cb.msisdn ? 'unknown_event' : 'no_msisdn';
    }
  } catch (err) {
    console.error('[webhooks/mno]', err);
    outcome = 'error';
    code = null;
  }

  const event = {
    receivedAt: new Date().toISOString(),
    method: req.method,
    ip: clientIp(req.headers),
    headers: Object.fromEntries(
      [...req.headers].filter(([k]) => !['cookie', 'x-webhook-secret', 'authorization', 'x-token'].includes(k)),
    ),
    contentType: req.headers.get('content-type'),
    raw: cb.raw,
    fields: cb.fields,
    msisdn: cb.msisdn,
    serviceId: cb.serviceId,
    action: cb.action,
    expiresAt: cb.expiresAt?.toISOString() ?? null,
    ownSecret,
    outcome,
  };
  const smsTo = code && cb.msisdn;
  const smsCode = code;

  later(async () => {
    let sms: SmsResult | null = null;
    if (smsTo && smsCode) {
      sms = await sendSms(smsTo, serviceId, welcomeSms(smsCode));
      if (!sms.ok) console.error(`[MNO Webhook] SMS to ${smsTo} failed:`, sms.status, sms.body);
    }
    try {
      await logMnoEvent({ ...event, sms });
    } catch (err) {
      console.error('[webhooks/mno] event log failed', err);
    }
  });

  console.info(`[MNO Webhook] ${cb.action} ${cb.msisdn ?? '-'} service=${serviceId} → ${outcome}`);

  return NextResponse.json({
    status: true,
    message: 'Bill Sync OK',
    ...(ownSecret && code && { code }),
  });
}

export const POST = handle;
export const GET = handle;
