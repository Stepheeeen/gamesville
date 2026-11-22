import { NextRequest, NextResponse } from 'next/server';
import { getUserByPhone, updateUser } from '@/lib/db';
import {
  RESET_CODE_TTL_MS,
  normaliseMsisdn,
  resetSms,
  resetThrottle,
  sendSms,
  subscriptionLapsed,
} from '@/lib/mno';

/** Same answer whether or not the number has an account, so this can't be used to probe subscribers. */
const SENT = {
  ok: true,
  message: 'If this number has an active Games Ville subscription, a reset code is on its way by SMS.',
};

/**
 * POST /api/auth/reset-code — { phone }
 *
 * "Forgot password" fallback for subscribers who also forgot their security
 * answer: texts a 15-minute code through Kitten. The code works on the normal
 * access-code sign-in, which leads straight to setting a new password and
 * security question. Only active subscribers get one (Kitten refuses to SMS
 * anyone else anyway), throttled to one a minute and three an hour.
 */
export async function POST(req: NextRequest) {
  try {
    const { phone: raw } = (await req.json().catch(() => ({}))) as { phone?: string };
    if (!raw || raw.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    const phone = normaliseMsisdn(raw);
    const user = await getUserByPhone(phone);

    if (!user?.subscription?.serviceId || subscriptionLapsed(user.subscription)) {
      return NextResponse.json(SENT);
    }

    const { allowed, history } = resetThrottle(user.resetSentAt);
    if (!allowed) {
      return NextResponse.json(
        { error: 'A code was sent recently. Please wait a minute and check your messages.' },
        { status: 429 },
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await updateUser(phone, {
      tempCode: code,
      tempCodeExpires: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(),
      codeAttempts: 0,
      isFirstLogin: true,
      resetSentAt: history.map((t) => t.toISOString()),
    });

    const sms = await sendSms(phone, user.subscription.serviceId, resetSms('Games Ville', code));
    if (!sms.ok) {
      console.error(`[auth/reset-code] SMS to ${phone} failed:`, sms.status, sms.body);
      return NextResponse.json(
        { error: "We couldn't send the SMS right now. Please try again shortly." },
        { status: 502 },
      );
    }
    return NextResponse.json(SENT);
  } catch (err) {
    console.error('[auth/reset-code]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
