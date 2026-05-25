import { create } from 'zustand';
import type { AuthState, AuthStatus, AuthProfile } from './types';
import type { Session } from '@supabase/supabase-js';

/**
 * Single source of truth for auth state.
 *
 * Consumers should NOT call supabase.auth.getSession() directly — they should
 * read from this store via useAuth(). The listener in lib/auth/listener.ts is
 * the only thing that mutates this store, and it does so via setAuth.
 *
 * Keeping this in zustand (rather than React context) means non-React code
 * paths (analytics, push registration, etc.) can read the current state
 * synchronously via useAuthStore.getState() without re-renders.
 */
type AuthStore = AuthState & {
  setAuth: (next: Partial<AuthState>) => void;
  setStatus: (status: AuthStatus) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: AuthProfile | null) => void;
  reset: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'checking',
  session: null,
  profile: null,
  setAuth: (next) => set((s) => ({ ...s, ...next })),
  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  reset: () => set({ status: 'signed-out', session: null, profile: null }),
}));

/**
 * React hook — subscribe to auth state.
 *
 * Split into three individual primitive/reference selectors rather than one
 * object-returning selector. Zustand v5 strict-compares selector return
 * values; an object literal would change reference every render and trigger
 * "Maximum update depth exceeded". Components that only need one field can
 * still optimize by calling useAuthStore(s => s.status) directly.
 */
export function useAuth(): AuthState {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  return { status, session, profile };
}
