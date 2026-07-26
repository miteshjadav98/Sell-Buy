import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { Cart } from '@/types/api';

/**
 * Every cart mutation returns the whole cart.
 *
 * That is the API's design and it is worth leaning on rather than fighting: the
 * client never has to reconstruct what a change did to the totals, so there is
 * no optimistic arithmetic to get wrong and no second round-trip to refetch.
 * The mutation's response *is* the new state.
 */
export const cartApi = {
  get: (): Promise<Cart> => apiGet<Cart>('/cart'),

  addItem: (variantId: string, quantity = 1): Promise<Cart> =>
    apiPost<Cart>('/cart/items', { variantId, quantity }),

  /** Absolute quantity, not a delta — matches the API and avoids double-apply bugs. */
  setQuantity: (itemId: string, quantity: number): Promise<Cart> =>
    apiPatch<Cart>(`/cart/items/${itemId}`, { quantity }),

  removeItem: (itemId: string): Promise<Cart> => apiDelete<Cart>(`/cart/items/${itemId}`),

  setSavedForLater: (itemId: string, savedForLater: boolean): Promise<Cart> =>
    apiPatch<Cart>(`/cart/items/${itemId}/saved`, { savedForLater }),

  clear: (): Promise<Cart> => apiDelete<Cart>('/cart'),

  /**
   * Folds the guest cart into the signed-in one. Called once, right after login.
   * The guest session id travels in the httpOnly `sb_cart` cookie, so there is
   * nothing to pass — the server reads it and clears it.
   */
  merge: (): Promise<Cart> => apiPost<Cart>('/cart/merge', {}),
};

export const cartKeys = {
  all: ['cart'] as const,
  current: () => [...cartKeys.all, 'current'] as const,
};
