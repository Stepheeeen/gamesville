// ── Prize Booth — Gamesville achievements ─────────────────────────────────────
// Declarative catalog; every check runs SERVER-SIDE only, over data the
// server itself computed (never trusted from the client). The score API
// diffs unlocked sets before/after a submission to reveal new prizes.

import { GAMES } from './game-catalog';
import type { UserStats } from './db';

export interface AchievementInput {
  stats: UserStats;
  /** gameId → personal best. */
  bests: Record<string, number>;
  /** Boards where the player currently ranks top 3. */
  medals: number;
  /** Boards where the player currently ranks #1. */
  crowns: number;
  champPoints: number;
  champRank: number | null;
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  check: (input: AchievementInput) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-ticket',
    emoji: '🎟️',
    title: 'First Ticket',
    description: 'Play your first midway game.',
    check: ({ stats }) => stats.plays >= 1,
  },
  {
    id: 'regular',
    emoji: '🎠',
    title: 'Fairground Regular',
    description: 'Play 25 games.',
    check: ({ stats }) => stats.plays >= 25,
  },
  {
    id: 'midway-master',
    emoji: '🎪',
    title: 'Midway Master',
    description: 'Win 10 games.',
    check: ({ stats }) => stats.wins >= 10,
  },
  {
    id: 'full-house',
    emoji: '🎡',
    title: 'Full House',
    description: 'Post a score in every booth on the midway.',
    check: ({ bests }) => GAMES.every((g) => (bests[g.id] ?? 0) > 0),
  },
  {
    id: 'streak-3',
    emoji: '🔥',
    title: 'Three Nights Running',
    description: 'Play on 3 days in a row.',
    check: ({ stats }) => stats.streak >= 3,
  },
  {
    id: 'streak-7',
    emoji: '🌟',
    title: 'Week at the Fair',
    description: 'Play on 7 days in a row.',
    check: ({ stats }) => stats.streak >= 7,
  },
  {
    id: 'record-breaker',
    emoji: '📈',
    title: 'Record Breaker',
    description: 'Set 5 new personal bests.',
    check: ({ stats }) => stats.records >= 5,
  },
  {
    id: 'high-striker',
    emoji: '🔨',
    title: 'High Striker',
    description: 'Hold a top-3 spot on any board.',
    check: ({ medals }) => medals >= 1,
  },
  {
    id: 'showstopper',
    emoji: '👑',
    title: 'Showstopper',
    description: 'Hold the #1 spot on any board.',
    check: ({ crowns }) => crowns >= 1,
  },
  {
    id: 'golden-plushie',
    emoji: '🧸',
    title: 'Golden Plushie',
    description: 'Rank top 10 in the Carnival Cup.',
    check: ({ champRank, champPoints }) => champRank !== null && champRank <= 10 && champPoints > 0,
  },
];

export function computeUnlocked(input: AchievementInput): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    try {
      if (a.check(input)) out.push(a.id);
    } catch {
      /* one bad check never hides the rest */
    }
  }
  return out;
}
