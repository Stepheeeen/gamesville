import { NextRequest, NextResponse } from 'next/server';
import { getGame } from '@/lib/game-catalog';
import { topScores, championship } from '@/lib/db';

/**
 * GET /api/leaderboard?game=<id>&limit=N   → per-game board (one row per player)
 * GET /api/leaderboard?game=championship   → Carnival Cup standings
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get('game') ?? 'championship';
  const limit = Math.min(Number(searchParams.get('limit') ?? 10), 100);

  try {
    if (gameId === 'championship') {
      const rows = await championship();
      return NextResponse.json({ board: 'championship', rows: rows.slice(0, limit) });
    }
    if (!getGame(gameId)) {
      return NextResponse.json({ error: 'Unknown board.' }, { status: 422 });
    }
    return NextResponse.json({ board: gameId, rows: await topScores(gameId, limit) });
  } catch (err) {
    console.error('[api/leaderboard]', err);
    return NextResponse.json({ board: gameId, rows: [] });
  }
}
