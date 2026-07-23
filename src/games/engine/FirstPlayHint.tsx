'use client';

import React, { useEffect, useState } from 'react';
import { getGame } from '@/lib/game-catalog';
import { sfx } from './audio';

/**
 * One-time "how to play" overlay, shown before a player's first session
 * of each game. Dismissal is remembered in localStorage.
 */
export default function FirstPlayHint({
  gameId,
  onDismiss,
}: {
  gameId: string;
  onDismiss: () => void;
}) {
  const game = getGame(gameId);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(`gv_hint_${gameId}`);
    if (seen) onDismiss();
    else setVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!visible || !game) return null;

  const dismiss = () => {
    localStorage.setItem(`gv_hint_${gameId}`, '1');
    sfx('tick');
    setVisible(false);
    onDismiss();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-5"
      style={{ background: 'rgba(18,8,24,0.9)', backdropFilter: 'blur(8px)' }}
    >
      <div className="max-w-xs text-center">
        <span className="mb-4 block text-5xl select-none" aria-hidden="true">
          {game.emoji}
        </span>
        <p className="mb-2 text-[9px] font-semibold tracking-[0.4em] text-muted uppercase">
          Booth Rules
        </p>
        <h3 className="font-display glow-gold mb-3 text-2xl">{game.howTo.title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-cream-2">{game.howTo.steps}</p>
        <button className="btn-carnival w-full" onClick={dismiss}>
          Step Right Up
        </button>
      </div>
    </div>
  );
}
