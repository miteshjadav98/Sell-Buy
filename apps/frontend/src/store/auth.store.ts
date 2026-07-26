'use client';

import { create } from 'zustand';
import { setAccessToken, setUnauthenticatedHandler } from '@/lib/api-client';
import type { AuthUser } from '@/types/api';

/**
 * Who is signed in.
 *
 * Note what is NOT persisted: nothing. Zustand's `persist` middleware is the
 * obvious reach here and it would be wrong — writing the user object to
 * localStorage means the UI can claim someone is signed in after their session
 * has actually expired, and the access token must never be written to disk at
 * all. The httpOnly refresh cookie is the source of truth, and `bootstrap()`
 * asks the server on every page load.
 */
interface AuthState {
  user: AuthUser | null;
  /** False until the first refresh attempt settles, so guards do not flash. */
  ready: boolean;
  signIn: (user: AuthUser, accessToken: string) => void;
  signOut: () => void;
  setUser: (user: AuthUser | null) => void;
  setReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,

  signIn: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, ready: true });
  },

  signOut: () => {
    setAccessToken(null);
    set({ user: null, ready: true });
  },

  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
}));

/**
 * Wires the API client's "refresh finally failed" signal to the store, so an
 * expired session clears the UI instead of leaving a stale name in the header
 * above endpoints that all return 401.
 */
export function registerAuthTeardown(): void {
  setUnauthenticatedHandler(() => {
    useAuthStore.setState({ user: null, ready: true });
  });
}

export const useCurrentUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.user !== null);
