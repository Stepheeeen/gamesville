/**
 * Regulation 10-pin scoring, kept free of Phaser so it can be reasoned about
 * (and tested) on its own. `rolls` is every ball's pin count in order; the
 * last frame simply carries its bonus balls at the end of that array.
 */

export const FRAMES = 5;
/** Five frames of strikes. */
export const PERFECT = 150;

/** Scoresheet glyph for a plain pin count ("–" for a miss). */
export function symbol(n: number): string {
  return n === 0 ? '–' : String(n);
}

/**
 * Canonical cumulative score. Bonus balls are consumed as look-ahead, so the
 * same loop covers the last frame. Missing bonus balls count as 0, which makes
 * the running total monotonic — it only ever climbs as the bonuses land, and
 * equals the official score once the game is complete.
 */
export function total(rolls: number[], frames = FRAMES): number {
  let score = 0;
  let i = 0;
  for (let f = 0; f < frames; f++) {
    if (rolls[i] === undefined) break;
    if (rolls[i] === 10) {
      score += 10 + (rolls[i + 1] ?? 0) + (rolls[i + 2] ?? 0);
      i += 1;
    } else if ((rolls[i] ?? 0) + (rolls[i + 1] ?? 0) === 10) {
      score += 10 + (rolls[i + 2] ?? 0);
      i += 2;
    } else {
      score += (rolls[i] ?? 0) + (rolls[i + 1] ?? 0);
      i += 2;
    }
  }
  return score;
}

export interface FrameRow {
  /** Glyphs for each ball bowled in this frame: "X", "/", "7", "–". */
  symbols: string[];
  /** Running total, or null while the frame is still awaiting balls or bonuses. */
  cumulative: number | null;
}

/** Per-frame scoresheet rows. A frame shows its total only once it can be closed. */
export function breakdown(rolls: number[], frames = FRAMES): FrameRow[] {
  const out: FrameRow[] = [];
  let i = 0;
  let running = 0;

  for (let f = 0; f < frames; f++) {
    const isLast = f === frames - 1;
    const a = rolls[i];
    const b = rolls[i + 1];
    const c = rolls[i + 2];

    if (a === undefined) {
      out.push({ symbols: [], cumulative: null });
      continue;
    }

    const symbols: string[] = [];
    let closed = false;
    let frameScore = 0;

    if (!isLast) {
      if (a === 10) {
        symbols.push('X');
        if (b !== undefined && c !== undefined) {
          frameScore = 10 + b + c;
          closed = true;
        }
        i += 1;
      } else {
        symbols.push(symbol(a));
        if (b !== undefined) {
          if (a + b === 10) {
            symbols.push('/');
            if (c !== undefined) {
              frameScore = 10 + c;
              closed = true;
            }
          } else {
            symbols.push(symbol(b));
            frameScore = a + b;
            closed = true;
          }
        }
        i += 2;
      }
    } else {
      symbols.push(a === 10 ? 'X' : symbol(a));
      if (b !== undefined) {
        if (a === 10) symbols.push(b === 10 ? 'X' : symbol(b));
        else symbols.push(a + b === 10 ? '/' : symbol(b));
      }
      if (c !== undefined) {
        // After a strike the second and third balls form their own pair, so a
        // 3 then 7 there is a spare — not two loose counts.
        if (a === 10 && b !== 10) symbols.push(b! + c === 10 ? '/' : symbol(c));
        else symbols.push(c === 10 ? 'X' : symbol(c));
      }
      const needsThird = a === 10 || (b !== undefined && a + b === 10);
      closed = needsThird ? c !== undefined : b !== undefined;
      if (closed) frameScore = a + (b ?? 0) + (c ?? 0);
    }

    if (closed) {
      running += frameScore;
      out.push({ symbols, cumulative: running });
    } else {
      out.push({ symbols, cumulative: null });
    }
  }
  return out;
}
