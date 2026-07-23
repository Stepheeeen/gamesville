'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from '@/lib/store';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const [showMenu, setShowMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Wait for zustand persist hydration before showing the auth zone.
  useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    signOut();
    setShowMenu(false);
    router.refresh();
  };

  const links = [
    { href: '/play', label: 'Midway' },
    { href: '/leaderboard', label: 'Carnival Cup' },
    { href: '/profile', label: 'Prize Booth' },
  ];

  return (
    <nav
      className="sticky top-0 z-40 glass"
      aria-label="Main navigation"
      style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
    >
      {/* Awning canopy strip above the bar */}
      <div className="awning h-2.5" aria-hidden />

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Marquee logo */}
        <Link
          href="/"
          className="font-display glow-gold text-lg tracking-wide"
          aria-label="Gamesville home"
        >
          GAMESVILLE
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 sm:flex">
          {links.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  active
                    ? 'bg-gold/15 text-gold-bright'
                    : 'text-cream-2 hover:bg-white/5 hover:text-cream'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Auth zone */}
        <div className="relative shrink-0">
          {!mounted ? null : user ? (
            <>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-border-bright bg-gold/10 py-1.5 pr-1.5 pl-3 transition-all hover:bg-gold/15"
              >
                <span className="max-w-25 truncate text-sm font-semibold text-cream-2">
                  {user.displayNumber}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-black text-bg-950">
                  {user.phone.slice(-2)}
                </span>
              </button>

              {showMenu && (
                <div className="fair-card absolute top-full right-0 z-50 mt-2 min-w-44 overflow-hidden shadow-2xl">
                  <div className="border-b border-border px-4 py-3">
                    <p className="mb-0.5 text-xs text-muted">Signed in as</p>
                    <p className="truncate text-sm font-semibold text-cream">
                      {user.displayNumber}
                    </p>
                  </div>
                  <div className="p-1">
                    <Link
                      href="/profile"
                      onClick={() => setShowMenu(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-cream-2 transition-colors hover:bg-white/5"
                    >
                      🎪 Prize Booth
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-danger transition-colors hover:bg-white/5"
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => router.push('/auth')}
              className="btn-carnival px-4! py-2! text-xs!"
            >
              🎟 Ticket Booth
            </button>
          )}
        </div>
      </div>

      {showMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
      )}
    </nav>
  );
}
