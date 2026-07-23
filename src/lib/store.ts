// ── Session store — Gamesville ────────────────────────────────────────────────
// Single reactive session for the whole app (replaces the two competing
// localStorage score/token schemes). Persisted to localStorage as
// 'gv-session', partialized to { token, user } — the auth-modal reason is
// runtime-only so any surface can open the Ticket Booth and the flow that
// triggered it (e.g. save-score) can resume once a token appears.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  phone: string;          // "+2349037311304"
  displayNumber: string;  // "+234 903 731 1304"
  isFirstLogin: boolean;
}

export type AuthReason = null | 'navbar' | 'save-score' | 'pass' | 'guard';

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  authModal: AuthReason;
  signIn: (token: string, user: SessionUser) => void;
  signOut: () => void;
  setUser: (user: SessionUser) => void;
  openAuth: (reason: Exclude<AuthReason, null>) => void;
  closeAuth: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      authModal: null,
      signIn: (token, user) => set({ token, user }),
      signOut: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
      openAuth: (reason) => set({ authModal: reason }),
      closeAuth: () => set({ authModal: null }),
    }),
    {
      name: 'gv-session',
      partialize: ({ token, user }) => ({ token, user }),
    },
  ),
);
