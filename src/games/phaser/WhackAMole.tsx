'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the WhackAMoleScene scene under the shared host. */
export default function WhackAMole(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/WhackAMoleScene').then((m) => m.whackAMoleConfig)}
      gameProps={props}
    />
  );
}
