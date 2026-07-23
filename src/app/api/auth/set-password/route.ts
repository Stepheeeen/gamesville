import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { updateUser, getUserById } from '@/lib/db';
import { bearerPayload, signToken } from '@/lib/jwt';

function formatMsisdn(msisdn: string): string {
  const m = msisdn.match(/^(\+\d{3})(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : msisdn;
}

/** POST /api/auth/set-password — bearer-protected first-login completion. */
export async function POST(req: NextRequest) {
  try {
    const payload = bearerPayload(req.headers.get('authorization'));
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorised. Please sign in again.' }, { status: 401 });
    }

    const { password, securityQuestion, securityAnswer } = (await req.json()) as {
      password: string;
      securityQuestion: string;
      securityAnswer: string;
    };

    if (!password || !securityQuestion || !securityAnswer) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const user = await getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const [passwordHash, securityAnswerHash] = await Promise.all([
      bcrypt.hash(password, 12),
      bcrypt.hash(securityAnswer.trim().toLowerCase(), 10),
    ]);

    await updateUser(user.phone, {
      passwordHash,
      securityQuestion,
      securityAnswerHash,
      isFirstLogin: false,
      tempCode: null,
      tempCodeExpires: null,
    });

    const newToken = signToken({
      userId: user.id,
      phone: user.phone,
      displayNumber: formatMsisdn(user.phone),
      isFirstLogin: false,
    });

    return NextResponse.json({ success: true, token: newToken });
  } catch (err) {
    console.error('[api/auth/set-password]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
