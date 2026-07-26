'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MapPin, Plus } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useMakeDefaultAddress,
  useUpdateAddress,
} from '@/features/addresses/use-addresses';
import { AddressForm, AddressSummary } from '@/components/address/address-form';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import type { Address, AddressInput } from '@/types/api';

function AddressBook() {
  const { data: addresses, isLoading } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const makeDefault = useMakeDefaultAddress();

  const [mode, setMode] = useState<{ kind: 'idle' } | { kind: 'new' } | { kind: 'edit'; address: Address }>({
    kind: 'idle',
  });

  if (isLoading) return <PageSpinner label="Loading your addresses" />;

  const save = (input: AddressInput) => {
    if (mode.kind === 'edit') {
      updateAddress.mutate(
        { id: mode.address.id, input },
        { onSuccess: () => setMode({ kind: 'idle' }) },
      );
    } else {
      createAddress.mutate(input, { onSuccess: () => setMode({ kind: 'idle' }) });
    }
  };

  const busy = createAddress.isPending || updateAddress.isPending;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-indigo"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden />
        Account
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">Addresses</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Delivery is priced from the PIN code, so keep these accurate.
          </p>
        </div>
        {mode.kind === 'idle' && (addresses?.length ?? 0) > 0 && (
          <Button variant="outline" onClick={() => setMode({ kind: 'new' })}>
            <Plus className="h-4 w-4" aria-hidden />
            Add address
          </Button>
        )}
      </header>

      {mode.kind !== 'idle' ? (
        <div className="mt-6 border border-rule bg-card p-5">
          <h2 className="mb-4 font-display text-lg text-ink">
            {mode.kind === 'edit' ? 'Edit address' : 'New address'}
          </h2>
          <AddressForm
            initial={mode.kind === 'edit' ? mode.address : undefined}
            submitLabel={mode.kind === 'edit' ? 'Save changes' : 'Save address'}
            busy={busy}
            onSubmit={save}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        </div>
      ) : (addresses?.length ?? 0) === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<MapPin className="h-8 w-8" />}
            title="No addresses saved"
            body="Add one now, or add it during checkout — either works."
          />
          <div className="flex justify-center">
            <Button onClick={() => setMode({ kind: 'new' })}>
              <Plus className="h-4 w-4" aria-hidden />
              Add your first address
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-2">
          {addresses?.map((address) => (
            <li key={address.id} className="border-b border-rule py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="neutral">{address.type}</Badge>
                    {address.isDefault && <Badge tone="moss">Default</Badge>}
                  </div>
                  <AddressSummary address={address} />
                </div>

                <div className="flex shrink-0 flex-wrap gap-3 text-xs">
                  {!address.isDefault && (
                    <button
                      onClick={() => makeDefault.mutate(address.id)}
                      className="text-indigo underline underline-offset-4 hover:text-indigo-deep"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    onClick={() => setMode({ kind: 'edit', address })}
                    className="text-ink-muted underline underline-offset-4 hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAddress.mutate(address.id)}
                    className="text-ink-muted underline underline-offset-4 hover:text-vermilion"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AddressesPage() {
  return (
    <RequireAuth>
      <AddressBook />
    </RequireAuth>
  );
}
