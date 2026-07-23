'use client';

import Link from 'next/link';
import { GAMES, featuredGame, CATEGORIES, type GameCategory } from '@/lib/game-catalog';
import { preloadGame } from '@/games/registry';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import AuthGuard from '@/components/AuthGuard';
import { useState } from 'react';

/** The midway is ticket-holders only — no session, no lobby. */
export default function MidwayPage() {
  return (
    <AuthGuard next="/play">
      <MidwayView />
    </AuthGuard>
  );
}

function MidwayView() {
  const featured = featuredGame();
  const [category, setCategory] = useState<GameCategory | 'All'>('All');

  const visible = category === 'All' ? GAMES : GAMES.filter((g) => g.category === category);

  return (
    <div className="fair-room min-h-screen pb-24 sm:pb-10">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4">
        {/* Tonight's featured attraction */}
        <section className="mt-8">
          <div className="bunting mb-4" aria-hidden />
          <Link
            href={`/play/${featured.id}`}
            onMouseEnter={() => preloadGame(featured.id)}
            onTouchStart={() => preloadGame(featured.id)}
            onFocus={() => preloadGame(featured.id)}
            className="marquee block p-8 text-center sm:p-10"
          >
            <p className="mb-2 text-[10px] font-bold tracking-[0.35em] text-muted uppercase">
              Tonight&apos;s featured attraction
            </p>
            <span className="mb-2 block text-6xl" aria-hidden>
              {featured.emoji}
            </span>
            <h1 className="font-display glow-gold mb-2 text-3xl sm:text-4xl">
              {featured.title}
            </h1>
            <p className="mb-5 text-sm text-cream-2">{featured.tagline}</p>
            <span className="btn-carnival">🎟 Step Right Up</span>
          </Link>
        </section>

        {/* Category filter */}
        <div className="mt-10 mb-5 flex flex-wrap items-center gap-2">
          {(['All', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`chip cursor-pointer ${category === c ? '' : 'opacity-50 hover:opacity-80'}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Ticket grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((game) => (
            <Link
              key={game.id}
              href={`/play/${game.id}`}
              onMouseEnter={() => preloadGame(game.id)}
              onTouchStart={() => preloadGame(game.id)}
              onFocus={() => preloadGame(game.id)}
              className="ticket block p-0"
            >
              <div className="flex items-center gap-4 p-5">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
                  style={{ background: `${game.accent}1f`, border: `1px solid ${game.accent}55` }}
                  aria-hidden
                >
                  {game.emoji}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display truncate text-lg text-cream">{game.title}</h2>
                  <p className="truncate text-xs text-muted">{game.tagline}</p>
                </div>
              </div>
              <hr className="ticket-perforation" />
              <div className="flex items-center justify-between p-4 pt-3">
                <span className="chip-teal chip">{game.category}</span>
                <span className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">
                  {game.difficulty}
                </span>
              </div>
            </Link>
          ))}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
