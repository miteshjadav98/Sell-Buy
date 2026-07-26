'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { useUiStore } from '@/store/ui.store';
import type { Cart } from '@/types/api';
import { cartApi, cartKeys } from './cart.api';

/**
 * The cart, and the five ways to change it.
 *
 * Every mutation writes the server's response straight into the cache with
 * `setQueryData` rather than invalidating and refetching. The API already
 * returns the complete recomputed cart, so a refetch would be a second
 * round-trip to learn something we were just told — and it would briefly show
 * stale totals while it ran.
 */
export function useCart() {
  return useQuery({
    queryKey: cartKeys.current(),
    queryFn: cartApi.get,
    // A cart is small, changes often, and is wrong the moment stock moves.
    staleTime: 15_000,
  });
}

function useCartMutation<TArgs extends unknown[]>(
  mutate: (...args: TArgs) => Promise<Cart>,
  successMessage?: string | ((...args: TArgs) => string),
) {
  const queryClient = useQueryClient();
  const notify = useUiStore((s) => s.notify);

  return useMutation({
    mutationFn: (args: TArgs) => mutate(...args),
    onSuccess: (cart, args) => {
      queryClient.setQueryData(cartKeys.current(), cart);
      if (!successMessage) return;
      notify(typeof successMessage === 'function' ? successMessage(...args) : successMessage);
    },
    onError: (error) => {
      // The API's messages are already written for shoppers ("Only 2 left of
      // …"), so they are shown verbatim rather than replaced with a generic one.
      notify(
        error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
        'error',
      );
    },
  });
}

export function useAddToCart() {
  const mutation = useCartMutation(
    (variantId: string, quantity: number) => cartApi.addItem(variantId, quantity),
    'Added to cart',
  );
  return {
    ...mutation,
    addToCart: (variantId: string, quantity = 1) => mutation.mutate([variantId, quantity]),
    addToCartAsync: (variantId: string, quantity = 1) =>
      mutation.mutateAsync([variantId, quantity]),
  };
}

export function useUpdateCartItem() {
  const mutation = useCartMutation((itemId: string, quantity: number) =>
    cartApi.setQuantity(itemId, quantity),
  );
  return {
    ...mutation,
    setQuantity: (itemId: string, quantity: number) => mutation.mutate([itemId, quantity]),
  };
}

export function useRemoveCartItem() {
  const mutation = useCartMutation((itemId: string) => cartApi.removeItem(itemId), 'Removed');
  return { ...mutation, remove: (itemId: string) => mutation.mutate([itemId]) };
}

export function useSaveForLater() {
  const mutation = useCartMutation(
    (itemId: string, saved: boolean) => cartApi.setSavedForLater(itemId, saved),
    (_itemId, saved) => (saved ? 'Saved for later' : 'Moved back to cart'),
  );
  return {
    ...mutation,
    setSaved: (itemId: string, saved: boolean) => mutation.mutate([itemId, saved]),
  };
}

export function useClearCart() {
  const mutation = useCartMutation(() => cartApi.clear(), 'Cart emptied');
  return { ...mutation, clear: () => mutation.mutate([]) };
}

/** Total units, for the header badge. Zero while the cart is still loading. */
export function useCartCount(): number {
  const { data } = useCart();
  return data?.summary.totalQuantity ?? 0;
}
