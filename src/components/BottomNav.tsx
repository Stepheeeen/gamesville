'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconPlay({ active }: { active: boolean }) {
  const c = active ? 'var(--color-gold-bright)' : 'var(--color-muted)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconTrophy({ active }: { active: boolean }) {
  const c = active ? 'var(--color-gold-bright)' : 'var(--color-muted)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M17 4H7a2 2 0 0 0-2 2v4a7 7 0 0 0 14 0V6a2 2 0 0 0-2-2z" />
      <path d="M5 8H3a2 2 0 0 0 0 4h2M19 8h2a2 2 0 0 0 0 4h-2" />
    </svg>
  );
}

function IconUser({ active }: { active: boolean }) {
  const c = active ? 'var(--color-gold-bright)' : 'var(--color-muted)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

const TABS = [
  { href: '/play', label: 'Midway', Icon: IconPlay },
  { href: '/leaderboard', label: 'Cup', Icon: IconTrophy },
  { href: '/profile', label: 'Prizes', Icon: IconUser },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Mobile navigation"
      style={{ borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5"
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <span
                className="absolute top-0 h-0.5 w-8 rounded-full bg-gold shadow-[0_0_8px_rgba(255,198,77,0.8)]"
                aria-hidden
              />
            )}
            <Icon active={active} />
            <span
              className={`text-[10px] font-bold tracking-wider uppercase ${
                active ? 'text-gold-bright' : 'text-muted'
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
