import { NextRequest, NextResponse } from 'next/server';
import { getGame, getScoreBounds } from '@/lib/game-catalog';
import { submitScore, bumpStats, topScores, championship } from '@/lib/db';
import { buildProfile } from '@/lib/profile';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { bearerPayload } from '@/lib/jwt';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/scores?game=<id>          → per-game top 10
 * GET /api/scores?board=championship → Carnival Cup standings
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board');
  const gameId = searchParams.get('game');

  if (board === 'championship') {
    return NextResponse.json({ board: 'championship', rows: await championship() });
  }
  if (gameId && getGame(gameId)) {
    return NextResponse.json({ board: gameId, rows: await topScores(gameId, 10) });
  }
  return NextResponse.json({ error: 'Unknown board.' }, { status: 422 });
}

/**
 * POST /api/scores — { gameId, score, outcome? }
 * Trust model:
 *  - identity comes from the bearer token, never the body
 *  - the game must exist in the catalog; the score must be a finite
 *    integer within the catalog's plausibility bounds
 *  - sliding-window rate limit: 10 submissions / 60s per player
 *  - achievements are diffed server-side and returned for the overlay
 */
export async function POST(req: NextRequest) {
  try {
    const payload = bearerPayload(req.headers.get('authorization'));
    if (!payload) {
      return NextResponse.json({ error: 'Sign in to post scores.' }, { status: 401 });
    }
    const phone = payload.phone;

    if (!rateLimit(`scores:${phone}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Slow down — too many submissions.' }, { status: 429 });
    }

    const { gameId, score, outcome } = (await req.json()) as {
      gameId: string;
      score: unknown;
      outcome?: string;
    };

    const game = getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: 'Unknown game.' }, { status: 422 });
    }

    const bounds = getScoreBounds(gameId)!;
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      !Number.isInteger(score) ||
      score < bounds.min ||
      score > bounds.max
    ) {
      return NextResponse.json({ error: 'Score rejected.' }, { status: 422 });
    }

    // Outcome: client claim coerced to win/draw/loss; fall back to winThreshold.
    const win =
      outcome === 'win' || (outcome == null && score >= game.winThreshold);

    const before = await buildProfile(phone);
    const { best } = await submitScore(phone, gameId, score);
    await bumpStats(phone, { win, record: best });
    const after = await buildProfile(phone);

    const beforeSet = new Set(before?.unlocked ?? []);
    const newAchievements = (after?.unlocked ?? [])
      .filter((id) => !beforeSet.has(id))
      .map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return { id: a.id, emoji: a.emoji, title: a.title };
      });

    return NextResponse.json({
      ok: true,
      best,
      rank: after?.perGame.find((gme) => gme.id === gameId)?.rank ?? null,
      newAchievements,
    });
  } catch (err) {
    console.error('[api/scores POST]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
