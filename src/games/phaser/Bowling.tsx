'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the BowlingScene scene under the shared host. */
export default function Bowling(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/BowlingScene').then((m) => m.bowlingConfig)}
      gameProps={props}
    />
  );
}
