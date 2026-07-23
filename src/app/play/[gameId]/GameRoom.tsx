'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getGame, formatScore } from '@/lib/game-catalog';
import { GAME_COMPONENTS, type RegisteredGameId } from '@/games/registry';
import { useGameFlow } from '@/games/engine/useGameFlow';
import { Hud, HudRow, HudChip } from '@/games/engine/Hud';
import { sfx, setMuted, isMuted } from '@/games/engine/audio';
import { haptic, HAPTIC } from '@/games/engine/haptics';
import { useSession } from '@/lib/store';
import GameErrorBoundary from '@/components/GameErrorBoundary';
import AuthGuard from '@/components/AuthGuard';
import type { GameOutcome, GameStatus } from '@/games/types';

interface RunResult {
  score: number;
  outcome: GameOutcome;
  isRecord: boolean;
}

interface NewPrize {
  id: string;
  emoji: string;
  title: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error';

function bestKey(gameId: string) {
  return `gv_best_${gameId}`;
}

function readBest(gameId: string): number {
  try {
    return parseInt(localStorage.getItem(bestKey(gameId)) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Game rooms are ticket-holders only — no session, no booth. */
export default function GameRoom({ gameId }: { gameId: string }) {
  return (
    <AuthGuard next={`/play/${gameId}`}>
      <GameRoomView gameId={gameId} />
    </AuthGuard>
  );
}

function GameRoomView({ gameId }: { gameId: string }) {
  const game = getGame(gameId)!;
  // Replay = bump the attempt counter; the keyed <Session> subtree remounts
  // wholesale (fresh countdown, fresh Phaser game, fresh state).
  const [attempt, setAttempt] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => setMutedState(isMuted()), []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    // Mobile: the room IS the screen — header + canvas fill 100dvh, nothing
    // scrolls. Desktop keeps the framed cabinet + rules card below.
    <div className="fair-room flex h-dvh flex-col overflow-hidden sm:block sm:h-auto sm:min-h-screen sm:overflow-visible">
      {/* Room bar */}
      <header className="glass z-40 flex h-16 shrink-0 items-center justify-between px-4 sm:sticky sm:top-0">
        <Link href="/play" className="text-sm font-bold text-cream-2 hover:text-cream">
          ← Midway
        </Link>
        <h1 className="font-display glow-gold text-base">
          {game.emoji} {game.title}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            className="hud-chip text-sm"
            aria-label="How to play"
            aria-haspopup="dialog"
          >
            ❔
          </button>
          <button
            onClick={toggleMute}
            className="hud-chip text-sm"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 sm:mx-auto sm:w-full sm:max-w-3xl sm:flex-none sm:px-4 sm:py-6">
        <Session
          key={attempt}
          gameId={gameId}
          onReplay={() => setAttempt((a) => a + 1)}
          forcePaused={showRules}
        />

        {/* Booth rules recap — desktop only; mobile uses the ❔ modal */}
        <section className="ticket hidden p-5 sm:my-6 sm:block">
          <p className="mb-2 text-[10px] font-bold tracking-[0.3em] text-muted uppercase">
            Booth Rules
          </p>
          <ul className="space-y-1.5">
            {game.howTo.rules.map((rule) => (
              <li key={rule} className="text-sm text-cream-2">
                🎪 {rule}
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Booth-rules modal (game pauses while open) */}
      {showRules && (
        <div
          className="fair-fade-in fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: 'rgba(18,8,24,0.85)', backdropFilter: 'blur(8px)' }}
          role="dialog"
          aria-modal="true"
          aria-label="How to play"
          onClick={() => setShowRules(false)}
        >
          <div
            className="marquee w-full max-w-sm p-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mb-3 block text-5xl" aria-hidden>
              {game.emoji}
            </span>
            <p className="mb-2 text-[10px] font-bold tracking-[0.3em] text-muted uppercase">
              Booth Rules
            </p>
            <h2 className="font-display glow-gold mb-3 text-2xl">{game.howTo.title}</h2>
            <p className="mb-4 text-sm leading-relaxed text-cream-2">{game.howTo.steps}</p>
            <ul className="mb-6 space-y-1.5 text-left">
              {game.howTo.rules.map((rule) => (
                <li key={rule} className="text-sm text-cream-2">
                  🎪 {rule}
                </li>
              ))}
            </ul>
            <button className="btn-carnival w-full" onClick={() => setShowRules(false)}>
              Got it — back to the game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Session({
  gameId,
  onReplay,
  forcePaused = false,
}: {
  gameId: string;
  onReplay: () => void;
  forcePaused?: boolean;
}) {
  const game = getGame(gameId)!;
  const GameComponent = GAME_COMPONENTS[gameId as RegisteredGameId];
  const { ready, overlays } = useGameFlow(gameId);
  const token = useSession((s) => s.token);

  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [best, setBest] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [newPrizes, setNewPrizes] = useState<NewPrize[]>([]);
  const overFired = useRef(false);

  useEffect(() => setBest(readBest(gameId)), [gameId]);

  const onScore = useCallback((s: number) => setScore(s), []);
  const onStatus = useCallback((s: GameStatus) => setStatus(s), []);

  const onGameOver = useCallback(
    (finalScore: number, outcome?: GameOutcome) => {
      if (overFired.current) return;
      overFired.current = true;

      const resolved: GameOutcome =
        outcome ?? (finalScore >= game.winThreshold ? 'win' : 'loss');
      const prevBest = readBest(gameId);
      const isRecord = finalScore > prevBest;
      if (isRecord) {
        try {
          localStorage.setItem(bestKey(gameId), String(finalScore));
        } catch { /* quota */ }
        setBest(finalScore);
      }

      if (isRecord && prevBest > 0) {
        sfx('record');
        haptic(HAPTIC.record);
      } else if (resolved === 'win') {
        sfx('fanfare');
        haptic(HAPTIC.score);
      } else {
        sfx('buzzer');
        haptic(HAPTIC.light);
      }

      setScore(finalScore);
      setResult({ score: finalScore, outcome: resolved, isRecord });
    },
    [game.winThreshold, gameId],
  );

  // Deferred score save: posts once a result AND a token exist, so signing
  // in from the game-over overlay submits the pending score automatically.
  useEffect(() => {
    if (!result) return;
    if (!token) {
      setSaveState('local');
      return;
    }
    let cancelled = false;
    setSaveState('saving');
    (async () => {
      try {
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId,
            score: result.score,
            outcome: result.outcome,
          }),
        });
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as { newAchievements?: NewPrize[] };
          setSaveState('saved');
          if (json.newAchievements?.length) {
            setNewPrizes(json.newAchievements);
            sfx('cheer');
          }
        } else {
          setSaveState('error');
        }
      } catch {
        if (!cancelled) setSaveState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result, token, gameId]);

  const paused = !ready || result !== null || forcePaused;

  return (
    <div className="stage">
      <GameErrorBoundary onRetry={onReplay}>
        <GameComponent
          paused={paused}
          onScore={onScore}
          onStatus={onStatus}
          onGameOver={onGameOver}
        />
      </GameErrorBoundary>

      {/* HUD */}
      <Hud>
        <HudRow>
          <HudChip label="Score" value={formatScore(score)} />
          <div className="flex gap-2">
            {status.timeLeft != null && <HudChip label="Time" value={status.timeLeft} />}
            {status.streak != null && status.streak > 1 && (
              <HudChip label="Streak" value={`×${status.streak}`} />
            )}
            {status.level != null && <HudChip label="Level" value={status.level} />}
            {status.lives != null && <HudChip label="Lives" value={status.lives} />}
            <HudChip label="Best" value={best > 0 ? formatScore(best) : '—'} />
          </div>
        </HudRow>
        <div />
      </Hud>

      {overlays}

      {/* Game-over overlay */}
      {result && (
        <div
          className="fair-fade-in absolute inset-0 z-40 flex items-center justify-center p-5"
          style={{ background: 'rgba(18,8,24,0.88)', backdropFilter: 'blur(10px)' }}
        >
          <div className="marquee w-full max-w-sm p-7 text-center">
            <p className="mb-1 text-[10px] font-bold tracking-[0.3em] text-muted uppercase">
              {result.outcome === 'win' ? 'Winner winner!' : 'Round over'}
            </p>
            <p className="font-display glow-gold mb-1 text-6xl">{formatScore(result.score)}</p>
            <p className="mb-4 text-xs text-muted">points scored</p>

            {result.isRecord && (
              <div className="chip marquee-glow mb-4">🏆 New personal best!</div>
            )}

            {newPrizes.length > 0 && (
              <div className="mb-4 space-y-2">
                {newPrizes.map((p) => (
                  <div key={p.id} className="prize-badge unlocked prize-pop">
                    <span className="text-2xl">{p.emoji}</span>
                    <span className="text-xs font-bold text-gold-bright">{p.title}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="mb-5 text-xs text-cream-2">
              {saveState === 'saving' && 'Posting to the board…'}
              {saveState === 'saved' && '✓ On the board'}
              {saveState === 'error' && 'Board unreachable — kept locally'}
              {saveState === 'local' && 'Kept locally'}
            </p>

            <div className="flex flex-col gap-2.5">
              <button className="btn-carnival w-full" onClick={onReplay}>
                ↺ Play Again
              </button>
              {saveState === 'local' && (
                <Link href="/auth?next=/play" className="btn-ghost w-full">
                  🎟 Sign in to post this score
                </Link>
              )}
              <Link href="/play" className="btn-ghost w-full">
                ← Back to Midway
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
