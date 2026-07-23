// ── buildProfile — one payload for the profile page and score diffs ───────────

import {
  getUserByPhone,
  playerBests,
  rankInGame,
  championship,
  passActive,
  type UserStats,
  type UserDoc,
} from './db';
import { GAMES } from './game-catalog';
import { computeUnlocked, type AchievementInput } from './achievements';

export interface ProfilePayload {
  phone: string;
  isFirstLogin: boolean;
  pass: UserDoc['pass'];
  passActive: boolean;
  stats: UserStats;
  perGame: { id: string; best: number | null; rank: number | null }[];
  champ: { points: number; rank: number | null };
  medals: number;
  crowns: number;
  unlocked: string[];
}

export async function buildProfile(phone: string): Promise<ProfilePayload | null> {
  const user = await getUserByPhone(phone);
  if (!user) return null;

  const bests = await playerBests(phone);
  const perGame = await Promise.all(
    GAMES.map(async (g) => ({
      id: g.id,
      best: bests[g.id] ?? null,
      rank: bests[g.id] != null ? await rankInGame(phone, g.id) : null,
    })),
  );

  const standings = await championship();
  const champIdx = standings.findIndex((r) => r.phone === phone);
  const champ = {
    points: champIdx >= 0 ? standings[champIdx].points : 0,
    rank: champIdx >= 0 ? champIdx + 1 : null,
  };

  const medals = perGame.filter((g) => g.rank !== null && g.rank <= 3).length;
  const crowns = perGame.filter((g) => g.rank === 1).length;

  const input: AchievementInput = {
    stats: user.stats,
    bests,
    medals,
    crowns,
    champPoints: champ.points,
    champRank: champ.rank,
  };

  return {
    phone: user.phone,
    isFirstLogin: user.isFirstLogin,
    pass: user.pass,
    passActive: passActive(user),
    stats: user.stats,
    perGame,
    champ,
    medals,
    crowns,
    unlocked: computeUnlocked(input),
  };
}
