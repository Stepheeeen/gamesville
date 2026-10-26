/**
 * MNO Subscription Webhook — Gamesville
 * POST /api/webhooks/mno   (GET with query params is accepted too)
 *
 * Called by the aggregator (NasVille / MTN datasync) on subscription events.
 *   subscribe   → issue a fresh 6-digit access code (create the user if new)
 *   unsubscribe → revoke the access code and pass
 *
 * Every callback is recorded via logMnoEvent and acknowledged with 200 so the
 * aggregator never sees a failed delivery. Only trusted sources (see
 * lib/mno.ts → trustedSource) change subscription state, and only our own
 * x-webhook-secret gets the access code echoed back in the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByPhone, createUser, updateUser, cancelPass, logMnoEvent } from '@/lib/db';
import { clientIp, parseCallback, trustedSource } from '@/lib/mno';

const CODE_TTL_MS = 48 * 60 * 60 * 1000;

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function handle(req: NextRequest) {
  const raw = req.method === 'POST' ? await req.text() : '';
  const cb = parseCallback(raw, req.headers.get('content-type') ?? '', req.nextUrl.searchParams);
  const auth = trustedSource(req.headers);

  let outcome = 'logged';
  let code: string | null = null;

  try {
    if (auth.trusted && cb.msisdn && cb.action !== 'unknown') {
      const phone = cb.msisdn;
      if (cb.action === 'unsubscribe') {
        await updateUser(phone, { tempCode: null, tempCodeExpires: null });
        await cancelPass(phone);
        outcome = 'unsubscribed';
      } else {
        code = generate6DigitCode();
        if (await getUserByPhone(phone)) {
          await updateUser(phone, {
            tempCode: code,
            tempCodeExpires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
          });
          outcome = 'resubscribed';
        } else {
          await createUser(phone, code, CODE_TTL_MS);
          outcome = 'subscribed';
        }
      }
    } else if (!auth.trusted) {
      outcome = 'untrusted';
    } else {
      outcome = cb.msisdn ? 'unknown_event' : 'no_msisdn';
    }
  } catch (err) {
    console.error('[webhooks/mno]', err);
    outcome = 'error';
  }

  try {
    await logMnoEvent({
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
      trustedVia: auth.via,
      outcome,
    });
  } catch (err) {
    console.error('[webhooks/mno] event log failed', err);
  }

  console.info(`[MNO Webhook] ${cb.action} ${cb.msisdn ?? '-'} service=${cb.serviceId ?? '-'} → ${outcome}`);

  return NextResponse.json({
    status: 'success',
    success: true,
    ...(cb.msisdn && { msisdn: cb.msisdn }),
    ...(auth.secret && code && { code }),
  });
}

export const POST = handle;
export const GET = handle;
