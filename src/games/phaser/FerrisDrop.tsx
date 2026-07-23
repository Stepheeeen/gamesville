'use client';

import PhaserHost from '../engine/PhaserHost';
import type { GameProps } from '../types';

/** Thin adapter: mounts the FerrisDropScene scene under the shared host. */
export default function FerrisDrop(props: GameProps) {
  return (
    <PhaserHost
      load={() => import('@/game-engine/FerrisDropScene').then((m) => m.ferrisDropConfig)}
      gameProps={props}
    />
  );
}
