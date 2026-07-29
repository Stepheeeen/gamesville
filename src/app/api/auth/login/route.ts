import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserByPhone } from '@/lib/db';
import { signToken } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';
import { ensureDemoAccount } from '@/lib/demo';

function formatMsisdn(msisdn: string): string {
  const m = msisdn.match(/^(\+\d{3})(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : msisdn;
}

/**
 * POST /api/auth/login — { phone, credential, credentialType: 'code' | 'password' }
 * Authenticates EXISTING users only. Accounts are created by the MNO
 * subscription webhook (or /api/auth/register in mock mode) — the old
 * auto-create backdoor is gone.
 */
export async function POST(req: NextRequest) {
  try {
    const { phone, credential, credentialType } = (await req.json()) as {
      phone: string;
      credential: string;
      credentialType: 'code' | 'password';
    };

    if (!phone || !credential) {
      return NextResponse.json({ error: 'Phone and credential are required.' }, { status: 400 });
    }

    // Brute-force guard: 10 attempts / 15 min per phone.
    if (!rateLimit(`login:${phone}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    // Onboarding exception: seed the allow-listed demo account so it can
    // sign in with its password without an SMS subscription. No-op otherwise.
    await ensureDemoAccount(phone);

    const user = await getUserByPhone(phone);
    if (!user) {
      return NextResponse.json(
        { error: 'No account for this number. Subscribe first to get your access code.' },
        { status: 401 },
      );
    }

    if (credentialType === 'code') {
      if (!user.tempCode || user.tempCode !== credential) {
        return NextResponse.json({ error: 'Incorrect access code. Please check your SMS.' }, { status: 401 });
      }
      if (user.tempCodeExpires && new Date(user.tempCodeExpires) < new Date()) {
        return NextResponse.json({ error: 'Your access code has expired. Please re-subscribe.' }, { status: 401 });
      }
      const token = signToken({
        userId: user.id,
        phone: user.phone,
        displayNumber: formatMsisdn(user.phone),
        isFirstLogin: user.isFirstLogin,
      });
      return NextResponse.json({ token, isFirstLogin: user.isFirstLogin });
    }

    if (credentialType === 'password') {
      if (!user.passwordHash) {
        return NextResponse.json(
          { error: 'Password not set. Please use your access code to log in.' },
          { status: 401 },
        );
      }
      const valid = await bcrypt.compare(credential, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: 'Incorrect phone number or password.' }, { status: 401 });
      }
      const token = signToken({
        userId: user.id,
        phone: user.phone,
        displayNumber: formatMsisdn(user.phone),
        isFirstLogin: false,
      });
      return NextResponse.json({ token, isFirstLogin: false });
    }

    return NextResponse.json({ error: 'Invalid credential type.' }, { status: 400 });
  } catch (err) {
    console.error('[api/auth/login]', err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
