import { NextRequest, NextResponse } from 'next/server';
import { bearerPayload } from '@/lib/jwt';
import { getUserByPhone } from '@/lib/db';
import { subscriptionLapsed } from '@/lib/mno';

/**
 * GET /api/session — is this session still good?
 *
 * The client only decodes its JWT, so it can't tell a forged or stale token
 * from a real one. This verifies the signature and expiry, and is where a
 * cancelled or expired carrier subscription takes effect for players who are
 * already signed in: 401/403 makes AuthGuard sign them out.
 */
export async function GET(req: NextRequest) {
  const auth = bearerPayload(req.headers.get('authorization'));
  if (!auth) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const user = await getUserByPhone(auth.phone);
    if (subscriptionLapsed(user?.subscription)) {
      return NextResponse.json({ ok: false, reason: 'subscription' }, { status: 403 });
    }
  } catch (err) {
    // DB trouble is not a verdict on the subscription — don't lock players out.
    console.error('[api/session] subscription check failed', err);
  }
  return NextResponse.json({ ok: true, userId: auth.userId, phone: auth.phone });
}
