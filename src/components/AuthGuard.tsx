'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/store';

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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (hydrated && !token) {
      router.replace(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [hydrated, token, next, router]);

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
