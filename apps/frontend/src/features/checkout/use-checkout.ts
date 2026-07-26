'use client';

import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { cartKeys } from '@/features/cart/cart.api';
import { useIsAuthenticated } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { PlaceOrderInput, PlacedOrder } from '@/types/api';
import { checkoutApi, checkoutKeys, type SummaryQuery } from './checkout.api';

export function useCheckoutSummary(query: SummaryQuery) {
  const isAuthenticated = useIsAuthenticated();

  return useQuery({
    queryKey: checkoutKeys.summary(query),
    queryFn: () => checkoutApi.summary(query),
    enabled: isAuthenticated,
    // Always refetched on mount: prices and stock move, and this screen is the
    // last thing a customer reads before agreeing to pay.
    staleTime: 0,
    retry: false,
  });
}

/**
 * Places the order, once.
 *
 * The idempotency key is minted when the checkout screen mounts and held for as
 * long as the customer stays on it — so a double-click, a flaky retry, or a
 * "Place order" pressed again after a timeout all carry the SAME key and
 * resolve to the same order. A key generated per click would defeat the entire
 * mechanism, which is the easy mistake here.
 *
 * A successful order is stashed in sessionStorage before navigating, because
 * there is no order-history endpoint yet (Step 9) and the confirmation screen
 * would otherwise have nothing to render on reload.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  const notify = useUiStore((s) => s.notify);
  const attemptKey = useRef<string>('');

  if (!attemptKey.current) {
    attemptKey.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const mutation = useMutation({
    mutationFn: (input: PlaceOrderInput) => checkoutApi.placeOrder(input, attemptKey.current),
    onSuccess: async (order) => {
      rememberOrder(order);
      // The cart was converted server-side; the cached copy is now a ghost.
      await queryClient.invalidateQueries({ queryKey: cartKeys.all });
      await queryClient.invalidateQueries({ queryKey: checkoutKeys.all });
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Could not place the order. Try again.',
        'error',
      );
    },
  });

  /** Starts a fresh attempt — used when the customer edits the basket and returns. */
  const resetAttempt = useCallback(() => {
    attemptKey.current = crypto.randomUUID();
  }, []);

  return { ...mutation, resetAttempt, idempotencyKey: attemptKey.current };
}

const ORDER_STORAGE_KEY = 'sb:last-order';

export function rememberOrder(order: PlacedOrder): void {
  try {
    sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Private browsing can refuse storage. The confirmation screen degrades to
    // "check your email" rather than breaking.
  }
}

export function recallOrder(): PlacedOrder | null {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlacedOrder) : null;
  } catch {
    return null;
  }
}
