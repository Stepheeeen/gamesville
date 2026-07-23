import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserByPhone } from '@/lib/db';
import { signPurposeToken } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';

/** POST /api/auth/verify-security — { phone, answer } → 10-min change token. */
export async function POST(req: NextRequest) {
  try {
    const { phone, answer } = (await req.json()) as { phone: string; answer: string };

    if (!phone || !answer) {
      return NextResponse.json({ error: 'Phone and answer are required.' }, { status: 400 });
    }

    // Guessing guard: 5 attempts / 10 min per phone.
    if (!rateLimit(`security:${phone}`, 5, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const user = await getUserByPhone(phone);
    if (!user) {
      return NextResponse.json({ error: 'No account found for this number.' }, { status: 404 });
    }
    if (!user.securityAnswerHash) {
      return NextResponse.json({ error: 'No security question set for this account.' }, { status: 400 });
    }

    const correct = await bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
    if (!correct) {
      return NextResponse.json({ error: 'Incorrect answer. Please try again.' }, { status: 401 });
    }

    const changeToken = signPurposeToken({ userId: user.id }, 'change-password', '10m');
    return NextResponse.json({ success: true, changeToken });
  } catch (err) {
    console.error('[api/auth/verify-security]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
