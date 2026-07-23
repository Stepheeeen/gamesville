import { NextRequest, NextResponse } from 'next/server';
import { getUserByPhone, createUser, updateUser } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const CODE_TTL_MS = 48 * 60 * 60 * 1000;

function normaliseMsisdn(raw: string, countryCode = '234'): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  return '+' + digits;
}

/**
 * POST /api/auth/register — { phone }
 * Mock-MNO signup/resend: issues (or refreshes) a 6-digit access code, the
 * same path the real MNO webhook takes on subscription. Enabled unless
 * MOCK_MNO=false — in real mode subscribers must come through the webhook.
 * Also serves as the resend-OTP endpoint (upsert + refresh).
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.MOCK_MNO === 'false') {
      return NextResponse.json(
        { error: 'Text GAME to 32770 to subscribe — your access code arrives by SMS.' },
        { status: 503 },
      );
    }

    const { phone: rawPhone } = (await req.json()) as { phone: string };
    if (!rawPhone || rawPhone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'A valid phone number is required.' }, { status: 400 });
    }
    const phone = normaliseMsisdn(rawPhone);

    // 3 codes / 10 min per phone.
    if (!rateLimit(`register:${phone}`, 3, 10 * 60_000)) {
      return NextResponse.json({ error: 'Too many code requests. Try again shortly.' }, { status: 429 });
    }

    // Mock mode uses a fixed, documented code so testers can sign in.
    const code = '123456';
    const existing = await getUserByPhone(phone);
    if (existing) {
      await updateUser(phone, {
        tempCode: code,
        tempCodeExpires: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      });
    } else {
      await createUser(phone, code, CODE_TTL_MS);
    }

    console.info(`[auth/register] mock OTP issued for ${phone}`);
    return NextResponse.json({ success: true, mock: true });
  } catch (err) {
    console.error('[api/auth/register]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
