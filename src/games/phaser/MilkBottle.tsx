'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the MilkBottleScene scene under the shared host. */
export default function MilkBottle(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/MilkBottleScene').then((m) => m.milkBottleConfig)}
      gameProps={props}
    />
  );
}
