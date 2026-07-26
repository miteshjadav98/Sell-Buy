'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { cartApi, cartKeys } from '@/features/cart/cart.api';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { authApi, type LoginInput, type RegisterInput } from './auth.api';

/**
 * Signing in has a second job: the guest cart.
 *
 * Someone who filled a basket before signing in must not find it empty
 * afterwards — that is the single most expensive bug a storefront can ship, and
 * it is invisible in testing because developers log in first. So every
 * successful sign-in calls `/cart/merge`, which folds the guest cart (identified
 * by the httpOnly `sb_cart` cookie) into the user's own.
 *
 * The merge is deliberately non-fatal. If it fails, the customer is still signed
 * in and their user cart is intact; failing the whole login over it would turn a
 * recoverable annoyance into a locked door.
 */
function useAuthSuccess() {
  const queryClient = useQueryClient();
  const signIn = useAuthStore((s) => s.signIn);

  return async (tokens: { accessToken: string; user: Parameters<typeof signIn>[0] }) => {
    signIn(tokens.user, tokens.accessToken);

    try {
      const merged = await cartApi.merge();
      queryClient.setQueryData(cartKeys.current(), merged);
    } catch {
      // Nothing to merge, or the merge failed; either way the session stands.
      await queryClient.invalidateQueries({ queryKey: cartKeys.all });
    }
  };
}

export function useLogin() {
  const router = useRouter();
  const onSuccess = useAuthSuccess();
  const notify = useUiStore((s) => s.notify);

  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: async (tokens) => {
      await onSuccess(tokens);
      router.refresh();
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Could not sign in. Try again.',
        'error',
      );
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const onSuccess = useAuthSuccess();
  const notify = useUiStore((s) => s.notify);

  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: async (tokens) => {
      await onSuccess(tokens);
      router.refresh();
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Could not create the account. Try again.',
        'error',
      );
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);

  return useMutation({
    mutationFn: () => authApi.logout(),
    // Runs on success *and* failure: if the server call fails, the local session
    // must still end. Leaving someone apparently signed in after they clicked
    // "Sign out" is the worse of the two outcomes.
    onSettled: async () => {
      signOut();
      // Everything cached was scoped to that person — cart, addresses, checkout.
      queryClient.clear();
      router.push('/');
      router.refresh();
    },
  });
}
