import { NextRequest, NextResponse } from 'next/server';
import { getUserByPhone, setPass, passActive, type PassType } from '@/lib/db';
import { PASS_CATALOG } from '@/lib/passes';
import { bearerPayload } from '@/lib/jwt';

/** GET /api/passes — catalog + the caller's current wristband. */
export async function GET(req: NextRequest) {
  const payload = bearerPayload(req.headers.get('authorization'));
  let pass = null;
  let active = false;
  if (payload) {
    const user = await getUserByPhone(payload.phone);
    pass = user?.pass ?? null;
    active = passActive(user);
  }
  return NextResponse.json({ catalog: PASS_CATALOG, pass, active });
}

/**
 * POST /api/passes — { type } purchase via MNO carrier billing.
 * MOCK_MNO (default on) activates instantly; real mode is the DCB
 * integration point and returns 503 until wired.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = bearerPayload(req.headers.get('authorization'));
    if (!payload) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const { type } = (await req.json()) as { type: PassType };
    const item = PASS_CATALOG.find((p) => p.type === type);
    if (!item) {
      return NextResponse.json({ error: 'Unknown pass type.' }, { status: 422 });
    }

    if (process.env.MOCK_MNO === 'false') {
      return NextResponse.json(
        { error: 'Carrier billing is not yet connected.' },
        { status: 503 },
      );
    }

    const pass = await setPass(payload.phone, item.type, item.days);
    return NextResponse.json({ ok: true, pass });
  } catch (err) {
    console.error('[api/passes]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
