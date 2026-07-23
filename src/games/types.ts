// ── Host ↔ game contract ──────────────────────────────────────────────────────
// The game room host owns flow (hint → countdown → play), the HUD, score
// saving and the game-over overlay. A game owns its canvas, physics and
// rules — and reports through these four props only.

export type GameOutcome = 'win' | 'loss' | 'draw';

export interface GameStatus {
  timeLeft?: number;
  streak?: number;
  level?: number;
  lives?: number;
}

export interface GameProps {
  /** Games must freeze simulation and ignore input while true. */
  paused: boolean;
  /** Live score feed for the HUD counter. */
  onScore: (score: number) => void;
  /** Optional extra HUD chips. */
  onStatus?: (status: GameStatus) => void;
  /**
   * Fired once when the run ends. `outcome` is optional — the host falls
   * back to the catalog's winThreshold when a game has no native win/loss.
   */
  onGameOver: (score: number, outcome?: GameOutcome) => void;
}
