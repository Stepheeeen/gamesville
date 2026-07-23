'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GAMES, formatScore } from '@/lib/game-catalog';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { PASS_CATALOG } from '@/lib/passes';
import { useSession } from '@/lib/store';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';

interface ProfileData {
  phone: string;
  pass: { type: string; expiresAt: string } | null;
  passActive: boolean;
  stats: { plays: number; wins: number; records: number; streak: number };
  perGame: { id: string; best: number | null; rank: number | null }[];
  champ: { points: number; rank: number | null };
  medals: number;
  crowns: number;
  unlocked: string[];
}

export default function ProfilePage() {
  return (
    <AuthGuard next="/profile">
      <ProfileView />
    </AuthGuard>
  );
}

function ProfileView() {
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => {});
  }, [token]);

  useEffect(load, [load]);

  const buyPass = async (type: string) => {
    if (!token || buying) return;
    setBuying(type);
    try {
      await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      });
      load();
    } finally {
      setBuying(null);
    }
  };

  const winRate =
    profile && profile.stats.plays > 0
      ? Math.round((profile.stats.wins / profile.stats.plays) * 100)
      : 0;

  return (
    <div className="fair-room min-h-screen pb-24 sm:pb-10">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4">
        {/* Header */}
        <header className="mt-10 mb-6 text-center">
          <span className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-border-bright bg-surface text-3xl">
            🎪
          </span>
          <h1 className="font-display glow-gold text-2xl">{user?.displayNumber}</h1>
          {profile?.champ.rank && (
            <p className="mt-1 text-sm text-cream-2">
              Carnival Cup: <strong className="text-gold-bright">#{profile.champ.rank}</strong> ·{' '}
              {profile.champ.points} pts
            </p>
          )}
        </header>

        {!profile ? (
          <div className="flex justify-center py-16">
            <div className="fair-spinner" />
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <section className="mb-6 grid grid-cols-4 gap-3">
              {[
                { label: 'Plays', value: formatScore(profile.stats.plays) },
                { label: 'Win rate', value: `${winRate}%` },
                { label: 'Streak', value: `${profile.stats.streak}${profile.stats.streak >= 3 ? '🔥' : ''}` },
                { label: 'Medals', value: `${profile.medals}` },
              ].map((t) => (
                <div key={t.label} className="fair-card p-4 text-center">
                  <p className="font-display text-xl text-cream">{t.value}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-wider text-muted uppercase">
                    {t.label}
                  </p>
                </div>
              ))}
            </section>

            {/* Wristband */}
            <section className="booth-panel mb-6 p-6">
              <h2 className="font-display mb-1 text-lg text-cream">🎟 Ride Tickets & Wristbands</h2>
              {profile.passActive && profile.pass ? (
                <p className="mb-4 text-sm text-cream-2">
                  <span className="chip marquee-glow mr-2">
                    {PASS_CATALOG.find((p) => p.type === profile.pass!.type)?.title ?? profile.pass.type}
                  </span>
                  valid until {new Date(profile.pass.expiresAt).toLocaleDateString()}
                </p>
              ) : (
                <p className="mb-4 text-sm text-muted">No active wristband — grab one below.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {PASS_CATALOG.map((p) => (
                  <button
                    key={p.type}
                    onClick={() => buyPass(p.type)}
                    disabled={buying !== null}
                    className="ticket cursor-pointer p-4 text-left disabled:opacity-50"
                  >
                    <p className="font-display text-sm text-cream">
                      {p.title} {p.hot && <span className="chip-candy chip ml-1">Hot</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted">{p.blurb}</p>
                    <p className="mt-2 text-sm font-bold text-gold-bright">
                      {buying === p.type ? 'Charging…' : p.price}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Per-game bests */}
            <section className="booth-panel mb-6 overflow-hidden">
              <div className="awning h-2" aria-hidden />
              <h2 className="font-display px-5 pt-4 pb-1 text-lg text-cream">Personal Bests</h2>
              <ul className="divide-y divide-border">
                {GAMES.map((g) => {
                  const row = profile.perGame.find((x) => x.id === g.id);
                  return (
                    <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-xl" aria-hidden>
                        {g.emoji}
                      </span>
                      <span className="flex-1 truncate text-sm text-cream-2">{g.title}</span>
                      {row?.rank != null && row.rank <= 3 && (
                        <span className="chip">#{row.rank} on board</span>
                      )}
                      <span className="font-display text-sm text-gold-bright">
                        {row?.best != null ? formatScore(row.best) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Prize Booth */}
            <section className="booth-panel mb-10 p-6">
              <h2 className="font-display mb-1 text-lg text-cream">🧸 Prize Booth</h2>
              <p className="mb-4 text-xs text-muted">
                {profile.unlocked.length} of {ACHIEVEMENTS.length} prizes claimed
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ACHIEVEMENTS.map((a) => {
                  const unlocked = profile.unlocked.includes(a.id);
                  return (
                    <div key={a.id} className={`prize-badge ${unlocked ? 'unlocked' : 'locked'}`}>
                      <span className="text-3xl" aria-hidden>
                        {a.emoji}
                      </span>
                      <span className="text-xs font-bold text-cream">{a.title}</span>
                      <span className="text-[10px] leading-snug text-muted">{a.description}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mb-10 text-center">
              <Link href="/play" className="btn-carnival">
                🎪 Back to the Midway
              </Link>
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
