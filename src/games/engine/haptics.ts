'use client';

/** Vibration presets — silently no-ops where unsupported (iOS Safari, desktop). */
export const HAPTIC = {
  light: [10],
  medium: [25],
  heavy: [45],
  score: [15, 40, 15],
  record: [20, 50, 20, 50, 40],
} as const;

export function haptic(pattern: readonly number[] = HAPTIC.light) {
  try {
    navigator.vibrate?.(pattern as number[]);
  } catch {
    /* never worth crashing for */
  }
}
