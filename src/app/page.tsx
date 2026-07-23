'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAMES, formatScore } from '@/lib/game-catalog';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';

interface Stats {
  totalPlayers: number;
  boards: Record<string, { players: number; top: number | null }>;
  recent: { phone: string; gameId: string; score: number; at: string }[];
}

function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 7)}•••${phone.slice(-2)}` : phone;
}

export default function LandingPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="fair-room min-h-screen pb-24 sm:pb-10">
      <Navbar />

      {/* Hero — the fair gate */}
      <header className="relative px-4 pt-14 pb-10 text-center sm:pt-20">
        <div className="bunting absolute inset-x-0 top-2" aria-hidden />
        <p className="chip-candy chip mb-5">🎪 The fair is open all night</p>
        <h1 className="font-display glow-gold mx-auto mb-4 max-w-3xl text-4xl leading-tight sm:text-6xl">
          GAMESVILLE
        </h1>
        <p className="mx-auto mb-2 max-w-xl text-lg text-cream-2">
          Five midway mini-games under the carnival lights.
        </p>
        <p className="mx-auto mb-8 max-w-xl text-sm text-muted">
          Swing, whack, shoot, drop and smash your way up the Carnival Cup.
          Subscribe by SMS — nothing to download.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/play" className="btn-carnival">
            🎟 Enter the Midway
          </Link>
          <Link href="/leaderboard" className="btn-ghost">
            🏆 Carnival Cup
          </Link>
        </div>
        {stats && stats.totalPlayers > 0 && (
          <p className="mt-6 text-xs text-muted">
            {formatScore(stats.totalPlayers)} player{stats.totalPlayers === 1 ? '' : 's'} at the
            fair
          </p>
        )}
      </header>

      {/* Live ticker */}
      {stats && stats.recent.length > 0 && (
        <div className="glass overflow-hidden border-x-0 py-2">
          <div className="ticker-track">
            {[...stats.recent, ...stats.recent].map((r, i) => (
              <span key={i} className="mx-6 text-xs whitespace-nowrap text-cream-2">
                <span className="live-dot mr-2 inline-block" />
                {maskPhone(r.phone)} scored{' '}
                <strong className="text-gold-bright">{formatScore(r.score)}</strong> on{' '}
                {GAMES.find((gm) => gm.id === r.gameId)?.title ?? r.gameId}
              </span>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4">
        {/* Game grid */}
        <section className="mt-14">
          <div className="mb-8 text-center">
            <h2 className="font-display mb-3 text-2xl text-cream sm:text-3xl">
              The Midway
            </h2>
            <div className="fair-rule" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {GAMES.map((game) => (
              <Link key={game.id} href={`/play/${game.id}`} className="fair-card p-5 text-center">
                <span className="mb-3 block text-4xl" aria-hidden>
                  {game.emoji}
                </span>
                <h3 className="font-display mb-1 text-sm text-cream">{game.title}</h3>
                <p className="text-[11px] text-muted">{game.tagline}</p>
                {stats?.boards[game.id]?.top != null && (
                  <p className="mt-3 text-[10px] font-bold tracking-wider text-gold-bright uppercase">
                    Top: {formatScore(stats.boards[game.id].top!)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* Carnival Cup explainer */}
        <section className="booth-panel mt-16 p-8 text-center sm:p-10">
          <span className="mb-3 block text-4xl" aria-hidden>
            🏆
          </span>
          <h2 className="font-display glow-gold mb-3 text-2xl">The Carnival Cup</h2>
          <p className="mx-auto mb-6 max-w-lg text-sm text-cream-2">
            Every booth pays championship points to its top ten — 25, 18, 15, 12, 10, 8, 6, 4, 2, 1
            — summed across all five games. Rule one board or place everywhere: both roads lead to
            the Cup.
          </p>
          <Link href="/leaderboard" className="btn-candy">
            See the standings
          </Link>
        </section>

        {/* How it works */}
        <section className="mt-16 mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { emoji: '📲', title: 'Subscribe by SMS', text: 'Text GAME to 32770 — your access code arrives by SMS.' },
            { emoji: '🎟️', title: 'Claim your ticket', text: 'Sign in at the Ticket Booth with your code, set a password.' },
            { emoji: '🧸', title: 'Win the prizes', text: 'Post scores, climb the Cup and fill your Prize Booth shelf.' },
          ].map((step) => (
            <div key={step.title} className="ticket p-6 text-center">
              <span className="mb-3 block text-3xl" aria-hidden>
                {step.emoji}
              </span>
              <h3 className="font-display mb-2 text-base text-cream">{step.title}</h3>
              <p className="text-xs leading-relaxed text-muted">{step.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center">
        <p className="font-display glow-gold mb-1 text-sm">GAMESVILLE</p>
        <p className="text-xs text-muted">The night carnival arcade. See you at the fair.</p>
      </footer>

      <BottomNav />
    </div>
  );
}
