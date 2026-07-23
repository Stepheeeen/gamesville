import { NextResponse } from 'next/server';
import { totalPlayers, boardCounts, topScores, recentScores } from '@/lib/db';
import { GAMES } from '@/lib/game-catalog';

interface StatsPayload {
  totalPlayers: number;
  boards: Record<string, { players: number; top: number | null }>;
  recent: { phone: string; gameId: string; score: number; at: string }[];
}

// 30s in-memory cache — lobby stats are cheap but hit on every visit.
// Real numbers only: no invented counts, honest zeros on a fresh install.
const g = globalThis as unknown as { __gvStats?: { at: number; data: StatsPayload } };

export async function GET() {
  try {
    if (g.__gvStats && Date.now() - g.__gvStats.at < 30_000) {
      return NextResponse.json(g.__gvStats.data);
    }

    const [players, counts, recent] = await Promise.all([
      totalPlayers(),
      boardCounts(),
      recentScores(8),
    ]);

    const boards: StatsPayload['boards'] = {};
    const tops = await Promise.all(GAMES.map((g) => topScores(g.id, 1)));
    GAMES.forEach((game, i) => {
      boards[game.id] = {
        players: counts[game.id] ?? 0,
        top: tops[i][0]?.score ?? null,
      };
    });

    const data: StatsPayload = { totalPlayers: players, boards, recent };
    g.__gvStats = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/stats]', err);
    return NextResponse.json({ totalPlayers: 0, boards: {}, recent: [] });
  }
}
