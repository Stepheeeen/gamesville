'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the HighStrikerScene scene under the shared host. */
export default function HighStriker(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/HighStrikerScene').then((m) => m.highStrikerConfig)}
      gameProps={props}
    />
  );
}
