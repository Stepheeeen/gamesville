'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GAMES, formatScore, getGame } from '@/lib/game-catalog';
import { useSession } from '@/lib/store';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';

interface GameRow {
  phone: string;
  score: number;
  at: string;
}

interface CupRow {
  phone: string;
  points: number;
  boards: number;
}

function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 7)}•••${phone.slice(-2)}` : phone;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [tab, setTab] = useState<string>('championship');
  const [rows, setRows] = useState<(GameRow | CupRow)[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useSession((s) => s.user);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?game=${tab}&limit=20`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((json) => {
        if (!cancelled) {
          setRows(json.rows ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const isCup = tab === 'championship';
  const game = isCup ? null : getGame(tab);

  return (
    <div className="fair-room min-h-screen pb-24 sm:pb-10">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4">
        <header className="mt-10 mb-6 text-center">
          <span className="mb-2 block text-4xl" aria-hidden>
            🏆
          </span>
          <h1 className="font-display glow-gold mb-2 text-3xl">Carnival Cup</h1>
          <p className="text-sm text-muted">
            Top ten on every board earn 25 · 18 · 15 · 12 · 10 · 8 · 6 · 4 · 2 · 1 points.
          </p>
        </header>

        {/* Board tabs */}
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setTab('championship')}
            className={`chip cursor-pointer ${isCup ? 'marquee-glow' : 'opacity-50 hover:opacity-80'}`}
          >
            🏆 The Cup
          </button>
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              className={`chip cursor-pointer ${tab === g.id ? 'marquee-glow' : 'opacity-50 hover:opacity-80'}`}
            >
              {g.emoji} {g.title}
            </button>
          ))}
        </div>

        {/* Board */}
        <section className="booth-panel overflow-hidden">
          <div className="awning-teal awning h-2" aria-hidden />
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="fair-spinner" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="mb-2 text-3xl" aria-hidden>
                🎪
              </p>
              <p className="mb-4 text-sm text-cream-2">
                No scores on this board yet — the prizes are still on the shelf.
              </p>
              {game && (
                <Link href={`/play/${game.id}`} className="btn-carnival">
                  Be the first
                </Link>
              )}
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {rows.map((row, i) => {
                const you = user && row.phone === user.phone;
                return (
                  <li
                    key={row.phone}
                    className={`flex items-center gap-4 px-5 py-3.5 ${you ? 'bg-gold/10' : ''}`}
                  >
                    <span className="w-8 text-center">
                      {i < 3 ? (
                        <span className="text-xl">{MEDALS[i]}</span>
                      ) : (
                        <span className="text-sm font-bold text-muted">#{i + 1}</span>
                      )}
                    </span>
                    <span className="flex-1 truncate text-sm font-semibold text-cream">
                      {maskPhone(row.phone)}
                      {you && <span className="chip ml-2">You</span>}
                    </span>
                    {isCup ? (
                      <span className="text-right">
                        <span className="font-display text-gold-bright">
                          {(row as CupRow).points} pts
                        </span>
                        <span className="block text-[10px] text-muted">
                          {(row as CupRow).boards} board{(row as CupRow).boards === 1 ? '' : 's'}
                        </span>
                      </span>
                    ) : (
                      <span className="font-display text-gold-bright">
                        {formatScore((row as GameRow).score)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {game && rows.length > 0 && (
          <div className="mt-6 text-center">
            <Link href={`/play/${game.id}`} className="btn-ghost">
              {game.emoji} Play {game.title}
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
