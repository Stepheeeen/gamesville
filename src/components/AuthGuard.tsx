'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/store';

/**
 * Server verdict per token, cached for the tab so moving between guarded
 * pages costs one request. Only 401/403 count as "no"; network errors and
 * 5xx let the player through and are retried on the next guarded page.
 */
const verdicts = new Map<string, Promise<boolean | null>>();

function checkSession(token: string): Promise<boolean | null> {
  let p = verdicts.get(token);
  if (!p) {
    p = fetch('/api/session', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((res) => (res.status === 401 || res.status === 403 ? false : res.ok ? true : null))
      .catch(() => null);
    p.then((v) => {
      if (v === null) verdicts.delete(token);
    });
    verdicts.set(token, p);
  }
  return p;
}

/**
 * useAuthGuard — returns { ready, signedIn } once the persisted session
 * has hydrated. Use to gate actions (not routes) on auth.
 */
export function useAuthGuard() {
  const token = useSession((s) => s.token);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  return { ready, signedIn: ready && !!token };
}

/**
 * AuthGuard — wraps content that requires auth.
 * If not signed in after hydration → redirects to /auth?next=[next].
 */
export default function AuthGuard({
  children,
  next = '/',
}: {
  children: React.ReactNode;
  next?: string;
}) {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const signOut = useSession((s) => s.signOut);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (hydrated && !token) {
      router.replace(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [hydrated, token, next, router]);

  // Drop sessions the server rejects (forged, expired, or subscription ended).
  useEffect(() => {
    if (!hydrated || !token) return;
    let live = true;
    checkSession(token).then((ok) => {
      if (live && ok === false) signOut();
    });
    return () => {
      live = false;
    };
  }, [hydrated, token, signOut]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-900">
        <div className="fair-spinner" />
        <p className="text-xs font-bold tracking-[0.3em] text-muted uppercase">
          Checking your ticket…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
