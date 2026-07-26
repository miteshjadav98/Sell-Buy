'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import type { Address, AddressInput, AddressType } from '@/types/api';

/** Mirrors the API's validators, so the reader is corrected before the round-trip. */
const PIN_PATTERN = /^[1-9][0-9]{5}$/;
const PHONE_PATTERN = /^[6-9][0-9]{9}$/;

const EMPTY: AddressInput = {
  type: 'HOME',
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
};

/**
 * One address form, used by both the account address book and the checkout
 * address step.
 *
 * It validates the two fields that cause real-world damage — the PIN code,
 * which shipping is priced from, and the mobile number, which the courier
 * calls. Everything else is left to the server, because duplicating an entire
 * validation ruleset in the browser guarantees the two drift.
 */
export function AddressForm({
  initial,
  submitLabel = 'Save address',
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Address;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (input: AddressInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<AddressInput>(() =>
    initial
      ? {
          type: initial.type,
          fullName: initial.fullName,
          phone: initial.phone,
          addressLine1: initial.addressLine1,
          addressLine2: initial.addressLine2 ?? '',
          landmark: initial.landmark ?? '',
          city: initial.city,
          state: initial.state,
          country: initial.country,
          postalCode: initial.postalCode,
          isDefault: initial.isDefault,
        }
      : EMPTY,
  );
  const [touched, setTouched] = useState(false);

  const pinError =
    touched && !PIN_PATTERN.test(form.postalCode) ? 'Enter a valid 6-digit PIN code' : undefined;
  const phoneError =
    touched && !PHONE_PATTERN.test(form.phone)
      ? 'Enter a 10-digit mobile number starting 6–9'
      : undefined;

  const set =
    (key: keyof AddressInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!PIN_PATTERN.test(form.postalCode) || !PHONE_PATTERN.test(form.phone)) return;

    onSubmit({
      ...form,
      addressLine2: form.addressLine2 || undefined,
      landmark: form.landmark || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" required>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={set('fullName')}
          />
        </Field>

        <Field label="Mobile" htmlFor="phone" required error={phoneError}>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            required
            invalid={Boolean(phoneError)}
            value={form.phone}
            onChange={set('phone')}
            onBlur={() => setTouched(true)}
            placeholder="9876543210"
          />
        </Field>
      </div>

      <Field label="Address" htmlFor="addressLine1" required>
        <Input
          id="addressLine1"
          autoComplete="address-line1"
          required
          value={form.addressLine1}
          onChange={set('addressLine1')}
          placeholder="Flat, house number, building"
        />
      </Field>

      <Field label="Area, street, sector" htmlFor="addressLine2">
        <Input
          id="addressLine2"
          autoComplete="address-line2"
          value={form.addressLine2 ?? ''}
          onChange={set('addressLine2')}
        />
      </Field>

      <Field label="Landmark" htmlFor="landmark" hint="Helps the courier find you">
        <Input id="landmark" value={form.landmark ?? ''} onChange={set('landmark')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="PIN code"
          htmlFor="postalCode"
          required
          error={pinError}
          hint="Delivery is priced from this"
        >
          <Input
            id="postalCode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            required
            invalid={Boolean(pinError)}
            value={form.postalCode}
            onChange={set('postalCode')}
            onBlur={() => setTouched(true)}
            className="tnum"
          />
        </Field>

        <Field label="City" htmlFor="city" required>
          <Input
            id="city"
            autoComplete="address-level2"
            required
            value={form.city}
            onChange={set('city')}
          />
        </Field>

        <Field label="State" htmlFor="state" required>
          <Input
            id="state"
            autoComplete="address-level1"
            required
            value={form.state}
            onChange={set('state')}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address type" htmlFor="type">
          <Select
            id="type"
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as AddressType }))}
          >
            <option value="HOME">Home</option>
            <option value="WORK">Work</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <label className="flex items-end gap-2 pb-2.5 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={form.isDefault ?? false}
            onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
            className="h-3.5 w-3.5 accent-[#2B4C7E]"
          />
          Make this my default delivery address
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Compact one-line rendering, used in pickers and confirmations. */
export function AddressSummary({ address }: { address: Address }) {
  return (
    <div className="text-sm leading-relaxed text-ink-muted">
      <span className="font-medium text-ink">{address.fullName}</span>
      <span className="tnum ml-2 text-xs">{address.phone}</span>
      <p>
        {[address.addressLine1, address.addressLine2, address.landmark]
          .filter(Boolean)
          .join(', ')}
      </p>
      <p>
        {address.city}, {address.state} <span className="tnum">{address.postalCode}</span>
      </p>
    </div>
  );
}
