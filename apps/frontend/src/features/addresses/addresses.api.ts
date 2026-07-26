import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api-client';
import type { Address, AddressInput } from '@/types/api';

export const addressesApi = {
  list: (): Promise<Address[]> => apiGet<Address[]>('/addresses'),

  create: (input: AddressInput): Promise<Address> => apiPost<Address>('/addresses', input),

  /** A full replacement, matching the API — a half-edited address ships to the wrong place. */
  update: (id: string, input: AddressInput): Promise<Address> =>
    apiPut<Address>(`/addresses/${id}`, input),

  makeDefault: (id: string): Promise<void> => apiPatch<void>(`/addresses/${id}/default`),

  remove: (id: string): Promise<void> => apiDelete<void>(`/addresses/${id}`),
};

export const addressKeys = {
  all: ['addresses'] as const,
  list: () => [...addressKeys.all, 'list'] as const,
};
