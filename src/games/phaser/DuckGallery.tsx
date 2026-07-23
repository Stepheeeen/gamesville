'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the DuckGalleryScene scene under the shared host. */
export default function DuckGallery(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/DuckGalleryScene').then((m) => m.duckGalleryConfig)}
      gameProps={props}
    />
  );
}
