'use client';

import React, { useState } from 'react';
import FirstPlayHint from './FirstPlayHint';
import Countdown from './Countdown';
import { sfx } from './audio';

/**
 * Standard pre-game flow: first-play hint (once per game, per device),
 * then a 3·2·1 countdown. `ready` stays false until both finish — the
 * host keeps the game paused and input ignored until then.
 */
export function useGameFlow(gameId: string): { ready: boolean; overlays: React.ReactNode } {
  const [hintDone, setHintDone] = useState(false);
  const [ready, setReady] = useState(false);

  const overlays = (
    <>
      {!hintDone && <FirstPlayHint gameId={gameId} onDismiss={() => setHintDone(true)} />}
      {hintDone && !ready && (
        <Countdown
          onGo={() => {
            setReady(true);
            sfx('bell');
          }}
        />
      )}
    </>
  );

  return { ready, overlays };
}
