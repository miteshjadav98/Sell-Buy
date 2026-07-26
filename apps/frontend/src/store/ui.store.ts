'use client';

import { create } from 'zustand';

/**
 * Purely client state: what is open, what was just announced.
 *
 * The rule this file exists to enforce is that nothing here duplicates server
 * data. Cart contents live in React Query, not in Zustand — the most common
 * state-management mistake in this kind of app is copying server data into a
 * client store and then spending the rest of the project fighting to keep the
 * two in sync. This store knows the cart drawer is *open*. It does not know
 * what is in it.
 */
export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
}

interface UiState {
  cartOpen: boolean;
  mobileNavOpen: boolean;
  toasts: Toast[];
  openCart: () => void;
  closeCart: () => void;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  notify: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>((set) => ({
  cartOpen: false,
  mobileNavOpen: false,
  toasts: [],

  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),

  notify: (message, tone = 'default') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    // Auto-dismiss. Errors linger a little longer because they usually ask the
    // reader to do something.
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      tone === 'error' ? 6000 : 3200,
    );
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
