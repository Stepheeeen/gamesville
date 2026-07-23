'use client';

import React, { useEffect, useRef } from 'react';
import type PhaserNS from 'phaser';
import type { GameProps } from '../types';

export type GameConfigLoader = () => Promise<PhaserNS.Types.Core.GameConfig>;

/**
 * SSR-safe Phaser 3 mount adapted to Gamesville's legacy scene modules:
 * each scene exports a full `GameConfig` (600×1000 canvas) and reports
 * through game-level events `SCORE_UPDATE` / `GAME_OVER`. The host:
 * - loads phaser + the scene module on the client only
 * - overrides parent/background/scale so the canvas FITs its stage
 * - subscribes the legacy events and forwards them to GameProps
 *   callbacks (with an idempotent game-over guard)
 * - implements pause by sleeping the game loop (freezes update+render
 *   +this.time timers, which legacy scenes rely on) and mirrors the flag
 *   into `game.registry` for scenes that check it
 * - sleeps the loop while the tab is hidden
 * - re-measures FIT on layout settle / resize (Phaser measures the
 *   parent once at boot; a stale measurement overflows the stage)
 * - fully destroys the game on unmount
 */
export default function PhaserHost({
  load,
  gameProps,
  background = '#120818',
}: {
  load: GameConfigLoader;
  gameProps: GameProps;
  background?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  // Latest props without remounting the game on each render.
  const propsRef = useRef(gameProps);
  useEffect(() => {
    propsRef.current = gameProps;
  });
  // load's identity is per-wrapper-module and stable; keep the initial one.
  const loadRef = useRef(load);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [{ default: Phaser }, config] = await Promise.all([
        import('phaser'),
        loadRef.current(),
      ]);
      if (cancelled || !hostRef.current) return;

      const game = new Phaser.Game({
        ...config,
        parent: hostRef.current,
        backgroundColor: background,
        scale: {
          ...(typeof config.scale === 'object' ? config.scale : {}),
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });
      gameRef.current = game;
      game.registry.set('paused', propsRef.current.paused);
      if (propsRef.current.paused) game.loop.sleep();

      // Legacy scene event bridge → GameProps.
      let over = false;
      game.events.on('SCORE_UPDATE', (s: number) => {
        if (!over) propsRef.current.onScore(s);
      });
      game.events.on('GAME_OVER', (s: number) => {
        if (over) return;
        over = true;
        propsRef.current.onGameOver(s);
      });

      const onVis = () => {
        if (document.visibilityState === 'hidden') game.loop.sleep();
        else if (!propsRef.current.paused) game.loop.wake();
      };
      document.addEventListener('visibilitychange', onVis);
      (game as unknown as { _gvOnVis: () => void })._gvOnVis = onVis;

      const refresh = () => game.scale.refresh();
      requestAnimationFrame(refresh);
      const ro = new ResizeObserver(refresh);
      ro.observe(hostRef.current);
      (game as unknown as { _gvRo: ResizeObserver })._gvRo = ro;
    })();

    return () => {
      cancelled = true;
      const game = gameRef.current;
      if (game) {
        const onVis = (game as unknown as { _gvOnVis?: () => void })._gvOnVis;
        if (onVis) document.removeEventListener('visibilitychange', onVis);
        (game as unknown as { _gvRo?: ResizeObserver })._gvRo?.disconnect();
        game.destroy(true);
        gameRef.current = null;
      }
    };
  }, [background]);

  // Mirror pause state into the running game. Sleeping the loop freezes
  // legacy scenes (update, render and this.time timers) wholesale.
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    game.registry.set('paused', gameProps.paused);
    try {
      if (gameProps.paused) game.loop.sleep();
      else if (document.visibilityState !== 'hidden') game.loop.wake();
    } catch {
      /* loop not booted yet */
    }
  }, [gameProps.paused]);

  return <div ref={hostRef} className="h-full w-full" style={{ touchAction: 'none' }} />;
}
