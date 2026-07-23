/**
 * MNO Subscription Webhook — Gamesville
 * POST /api/webhooks/mno
 *
 * Called by the MNO (MTN / Airtel / Glo) on subscription events.
 *   subscribed / activated / renewed → issue a fresh 6-digit access code
 *     (returned to the MNO to include in their SMS) and refresh the pass
 *   cancelled / expired             → revoke the access code and pass
 *
 * Security: the `x-webhook-secret` header must match WEBHOOK_SECRET.
 * In production the env var is REQUIRED; in dev a documented fallback
 * ('dev-secret') keeps local testing easy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByPhone, createUser, updateUser, cancelPass } from '@/lib/db';

const CODE_TTL_MS = 48 * 60 * 60 * 1000;

function normaliseMsisdn(raw: string): string {
  return '+' + raw.replace(/\D/g, '');
}

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const configured = process.env.WEBHOOK_SECRET;
    if (!configured && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
    }
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== (configured ?? 'dev-secret')) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json();
    const rawPhone = body.phone ?? body.msisdn ?? body.subscriber ?? body.number;
    if (!rawPhone) {
      return NextResponse.json({ error: 'Phone number not found in payload.' }, { status: 400 });
    }
    const phone = normaliseMsisdn(rawPhone);
    const event = String(body.event ?? 'subscribed').toLowerCase();

    if (event === 'cancelled' || event === 'expired') {
      await updateUser(phone, { tempCode: null, tempCodeExpires: null });
      await cancelPass(phone);
      console.info(`[MNO Webhook] ${event}: ${phone}`);
      return NextResponse.json({ success: true, phone });
    }

    if (event === 'subscribed' || event === 'activated' || event === 'renewed') {
      const code = generate6DigitCode();
      const existing = await getUserByPhone(phone);
      if (existing) {
        await updateUser(phone, {
          tempCode: code,
          tempCodeExpires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        });
        console.info(`[MNO Webhook] Re-subscription: ${phone}`);
      } else {
        await createUser(phone, code, CODE_TTL_MS);
        console.info(`[MNO Webhook] New subscriber: ${phone}`);
      }
      // The MNO includes this code in their subscription-success SMS.
      return NextResponse.json({ success: true, phone, code });
    }

    return NextResponse.json({ error: `Unhandled event '${event}'.` }, { status: 422 });
  } catch (err) {
    console.error('[webhooks/mno]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
