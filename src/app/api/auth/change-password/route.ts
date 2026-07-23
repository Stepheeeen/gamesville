import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserById, updateUser } from '@/lib/db';
import { signToken, verifyPurposeToken } from '@/lib/jwt';

function formatMsisdn(msisdn: string): string {
  const m = msisdn.match(/^(\+\d{3})(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : msisdn;
}

/** POST /api/auth/change-password — { changeToken, newPassword }. */
export async function POST(req: NextRequest) {
  try {
    const { changeToken, newPassword } = (await req.json()) as {
      changeToken: string;
      newPassword: string;
    };

    if (!changeToken || !newPassword) {
      return NextResponse.json({ error: 'Token and new password are required.' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const payload = verifyPurposeToken<{ userId: string }>(changeToken, 'change-password');
    if (!payload) {
      return NextResponse.json({ error: 'Change token is invalid or expired.' }, { status: 401 });
    }

    const user = await getUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateUser(user.phone, { passwordHash });

    const sessionToken = signToken({
      userId: user.id,
      phone: user.phone,
      displayNumber: formatMsisdn(user.phone),
      isFirstLogin: false,
    });

    return NextResponse.json({ success: true, token: sessionToken });
  } catch (err) {
    console.error('[api/auth/change-password]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
