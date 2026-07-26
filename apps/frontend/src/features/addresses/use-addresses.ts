'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { useIsAuthenticated } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { AddressInput } from '@/types/api';
import { addressKeys, addressesApi } from './addresses.api';

export function useAddresses() {
  const isAuthenticated = useIsAuthenticated();

  return useQuery({
    queryKey: addressKeys.list(),
    queryFn: addressesApi.list,
    // Asking for addresses while signed out is a guaranteed 401. Gating on auth
    // keeps that out of the network tab and out of the error boundary.
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/**
 * Address writes invalidate rather than patch the cache.
 *
 * Unlike the cart, a single address change has effects the response does not
 * describe: setting one default clears another, and deleting a default promotes
 * a third. Reconstructing that client-side would be re-implementing the server's
 * invariant in a second place — so the list is refetched and the server stays
 * the only thing that knows which address is the default.
 */
function useAddressMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  const notify = useUiStore((s) => s.notify);

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: addressKeys.all });
      // The checkout summary quotes shipping from the delivery PIN code, so it
      // is stale the moment the address book changes.
      await queryClient.invalidateQueries({ queryKey: ['checkout'] });
      notify(successMessage);
    },
    onError: (error) => {
      notify(
        error instanceof ApiError ? error.message : 'Could not save the address. Try again.',
        'error',
      );
    },
  });
}

export const useCreateAddress = () =>
  useAddressMutation((input: AddressInput) => addressesApi.create(input), 'Address saved');

export const useUpdateAddress = () =>
  useAddressMutation(
    ({ id, input }: { id: string; input: AddressInput }) => addressesApi.update(id, input),
    'Address updated',
  );

export const useDeleteAddress = () =>
  useAddressMutation((id: string) => addressesApi.remove(id), 'Address removed');

export const useMakeDefaultAddress = () =>
  useAddressMutation((id: string) => addressesApi.makeDefault(id), 'Default delivery address set');
