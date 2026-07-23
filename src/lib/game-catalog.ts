// ── Game catalog — the single source of truth ─────────────────────────────────
// Every surface reads from here: lobby cards, game rooms, leaderboard tabs,
// profile bests, and — critically — the score API's plausibility validation
// (`scoreBounds`) and win rules (`winThreshold`). UI copy and server tuning
// live side by side so they can never drift.

export type GameCategory = 'Puzzle' | 'Reflex' | 'Precision' | 'Word' | 'Sports';

export interface GameDefinition {
  id: string;
  title: string;
  category: GameCategory;
  emoji: string;
  /** Accent hex used on badges, glows and canvas chrome. */
  accent: string;
  difficulty: 'Casual' | 'Regular' | 'Pro';
  /** Score a run must reach to count as a win (host fallback outcome). */
  winThreshold: number;
  /** Server-side plausibility caps — submissions outside are rejected. */
  scoreBounds: { min: number; max: number };
  tagline: string;
  howTo: { title: string; steps: string; rules: string[] };
}

const GOLD = '#FFC64D';
const CANDY = '#FF4D5E';
const TEAL = '#2BD9C8';

export const GAMES: GameDefinition[] = [
  {
    id: 'striker',
    title: 'High Striker',
    category: 'Precision',
    emoji: '🔨',
    accent: GOLD,
    difficulty: 'Casual',
    winThreshold: 600,
    scoreBounds: { min: 0, max: 2500 },
    tagline: 'Ring the bell, prove your might.',
    howTo: {
      title: 'Swing the Hammer',
      steps:
        'A power meter sweeps back and forth, faster with every swing. Tap at the peak to slam the mallet and send the puck flying — hit the top to ring the bell.',
      rules: [
        '8 swings per run — the meter speeds up each time',
        'Ring the bell (92+) for a 100-point bonus',
        'Consecutive bells chain the bonus ×2, ×3…',
      ],
    },
  },
  {
    id: 'whack',
    title: 'Whack-a-Mole',
    category: 'Reflex',
    emoji: '🦫',
    accent: CANDY,
    difficulty: 'Regular',
    winThreshold: 300,
    scoreBounds: { min: 0, max: 2000 },
    tagline: 'Fast paws, faster hands.',
    howTo: {
      title: 'Whack the Critters',
      steps:
        'Critters pop out of nine holes, quicker and sneakier every wave. Tap them before they duck back down — but never tap the dynamite.',
      rules: [
        'Each critter pays 10 + a streak bonus',
        'Tapping dynamite costs a life — you have 3',
        'The round lasts 60 seconds',
      ],
    },
  },
  {
    id: 'ducks',
    title: 'Duck Gallery',
    category: 'Precision',
    emoji: '🦆',
    accent: TEAL,
    difficulty: 'Regular',
    winThreshold: 250,
    scoreBounds: { min: 0, max: 1000 },
    tagline: 'Lead the duck, take the shot.',
    howTo: {
      title: 'Shoot the Gallery',
      steps:
        'Rows of tin ducks glide across three lanes. Tap to shoot where you point — you have 20 shots, so lead your targets and make each one count.',
      rules: [
        'Standard duck 10 · small fast duck 25 · golden duck 50',
        'Hitting a NO-SHOOT sign voids 2 extra shots',
        'The run ends when the ammo is gone',
      ],
    },
  },
  {
    id: 'ferris',
    title: 'Ferris Drop',
    category: 'Reflex',
    emoji: '🎡',
    accent: GOLD,
    difficulty: 'Regular',
    winThreshold: 150,
    scoreBounds: { min: 0, max: 1200 },
    tagline: 'Time the wheel, stick the landing.',
    howTo: {
      title: 'Drop the Rider',
      steps:
        'The ferris wheel spins with one golden gondola open. Tap to drop your rider from the platform — time it so the open seat swings underneath.',
      rules: [
        'A catch pays 25; dead-center pays 40',
        'Every catch speeds the wheel up — and it may reverse',
        '3 missed drops end the run',
      ],
    },
  },
  {
    id: 'bottles',
    title: 'Milk Bottle Smash',
    category: 'Sports',
    emoji: '🥛',
    accent: CANDY,
    difficulty: 'Casual',
    winThreshold: 250,
    scoreBounds: { min: 0, max: 1000 },
    tagline: 'Three balls. Six bottles. No mercy.',
    howTo: {
      title: 'Smash the Pyramid',
      steps:
        'Drag back from the ball and release to hurl it at the bottle pyramid. Knock every bottle off the stand — you get 3 balls per pyramid, 3 pyramids per run.',
      rules: [
        'Each bottle off the stand pays 20',
        'A first-ball clean sweep pays a +60 STRIKE bonus',
        'Soft lobs don’t count — put your shoulder into it',
      ],
    },
  },
];

export const CATEGORIES: GameCategory[] = [...new Set(GAMES.map((g) => g.category))];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export function getScoreBounds(id: string): { min: number; max: number } | undefined {
  return getGame(id)?.scoreBounds;
}

export function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}

/** Featured attraction rotates by weekday so the marquee changes daily. */
export function featuredGame(): GameDefinition {
  return GAMES[new Date().getDay() % GAMES.length];
}
