'use client';

import dynamic from 'next/dynamic';
import { createElement, type ComponentType } from 'react';
import type { GameProps } from './types';

/**
 * gameId → component importer. Games are loaded per-room via next/dynamic
 * (ssr: false) so Phaser never ships with the lobby bundle, and warmed
 * into the module cache by `preloadGame` on lobby-card hover/touch/focus.
 */
const IMPORTERS = {
  striker: () => import('./phaser/HighStriker'),
  whack: () => import('./phaser/WhackAMole'),
  ducks: () => import('./phaser/DuckGallery'),
  ferris: () => import('./phaser/FerrisDrop'),
  bowling: () => import('./phaser/Bowling'),
} satisfies Record<string, () => Promise<{ default: ComponentType<GameProps> }>>;

export type RegisteredGameId = keyof typeof IMPORTERS;

function StageLoader() {
  return createElement(
    'div',
    { className: 'flex h-full w-full items-center justify-center' },
    createElement('div', { className: 'fair-spinner' }),
  );
}

export const GAME_COMPONENTS: Record<RegisteredGameId, ComponentType<GameProps>> =
  Object.fromEntries(
    (Object.entries(IMPORTERS) as [RegisteredGameId, () => Promise<{ default: ComponentType<GameProps> }>][]).map(
      ([id, importer]) => [id, dynamic(importer, { ssr: false, loading: StageLoader })],
    ),
  ) as Record<RegisteredGameId, ComponentType<GameProps>>;

const preloaded = new Set<string>();

/** Fire-and-forget chunk warm-up; a failed preload retries on next call. */
export function preloadGame(id: string) {
  const importer = IMPORTERS[id as RegisteredGameId];
  if (!importer || preloaded.has(id)) return;
  preloaded.add(id);
  importer().catch(() => preloaded.delete(id));
}
