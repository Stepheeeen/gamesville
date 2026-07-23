import { NextRequest, NextResponse } from 'next/server';
import { buildProfile } from '@/lib/profile';
import { bearerPayload } from '@/lib/jwt';

/** GET /api/profile — the caller's full profile payload. */
export async function GET(req: NextRequest) {
  const payload = bearerPayload(req.headers.get('authorization'));
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }
  try {
    const profile = await buildProfile(payload.phone);
    if (!profile) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (err) {
    console.error('[api/profile]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
