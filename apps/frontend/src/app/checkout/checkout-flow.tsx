'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Gift, Plus, Truck } from 'lucide-react';
import { useAddresses, useCreateAddress } from '@/features/addresses/use-addresses';
import { useCheckoutSummary, usePlaceOrder } from '@/features/checkout/use-checkout';
import { AddressForm, AddressSummary } from '@/components/address/address-form';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Money, ReceiptRow, ReceiptTotal } from '@/components/ui/receipt';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import type { AddressInput, PaymentMethod } from '@/types/api';

const METHOD_LABELS: Record<PaymentMethod, { label: string; hint: string }> = {
  UPI: { label: 'UPI', hint: 'GPay, PhonePe, Paytm' },
  CARD: { label: 'Card', hint: 'Credit or debit' },
  NET_BANKING: { label: 'Net banking', hint: 'All major banks' },
  WALLET: { label: 'Wallet', hint: 'Provider wallets' },
  EMI: { label: 'EMI', hint: 'Pay in instalments' },
  COD: { label: 'Cash on delivery', hint: 'Pay the courier' },
};

/**
 * Checkout, in one screen rather than a wizard.
 *
 * A multi-step wizard hides the total until the end, which is precisely the
 * anxiety this product exists to remove. Everything is on one page with the
 * receipt pinned beside it, recalculating as the address and coupon change — so
 * the number a customer agrees to is the number they have been watching the
 * whole time.
 */
export function CheckoutFlow() {
  const router = useRouter();

  const { data: addresses, isLoading: addressesLoading } = useAddresses();
  const createAddress = useCreateAddress();

  const [addressId, setAddressId] = useState<string | undefined>();
  const [addingAddress, setAddingAddress] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [giftWrap, setGiftWrap] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [note, setNote] = useState('');

  // Pre-select the default address once the book loads, so the common case
  // needs no interaction at all.
  useEffect(() => {
    if (!addressId && addresses?.length) {
      setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
    }
  }, [addresses, addressId]);

  const summaryQuery = useMemo(
    () => ({ addressId, couponCode: appliedCoupon, giftWrap }),
    [addressId, appliedCoupon, giftWrap],
  );
  const { data: summary, isLoading: summaryLoading, isError } = useCheckoutSummary(summaryQuery);

  const placeOrder = usePlaceOrder();

  // Keep the chosen method valid: if the gateway behind it goes down mid-session
  // the API stops offering it, and submitting it anyway would 503.
  useEffect(() => {
    if (summary && !summary.availablePaymentMethods.includes(method)) {
      setMethod(summary.availablePaymentMethods[0] ?? 'COD');
    }
  }, [summary, method]);

  if (addressesLoading || (summaryLoading && !summary)) {
    return <PageSpinner label="Pricing your order" />;
  }

  if (isError || (summary && summary.lines.length === 0)) {
    return (
      <EmptyState
        title="There is nothing to check out"
        body="Your cart is empty. Add something and come back."
        actionLabel="Browse products"
        actionHref="/products"
      />
    );
  }

  const blockers = summary?.blockers ?? [];
  // The address blocker is handled by the picker itself, so it is not repeated
  // in the warning list — one problem, one place to fix it.
  const itemBlockers = blockers.filter((b) => b !== 'Choose a delivery address');
  const canPlace = Boolean(addressId) && itemBlockers.length === 0 && !placeOrder.isPending;

  const submitAddress = (input: AddressInput) =>
    createAddress.mutate(input, {
      onSuccess: (created) => {
        setAddressId(created.id);
        setAddingAddress(false);
      },
    });

  const place = () => {
    if (!addressId) return;
    placeOrder.mutate(
      {
        addressId,
        paymentMethod: method,
        couponCode: appliedCoupon,
        giftWrap,
        customerNote: note.trim() || undefined,
      },
      { onSuccess: () => router.push('/checkout/done') },
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl tracking-tight text-ink">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-10">
          {/* ---- Delivery address ---- */}
          <section>
            <SectionHeading step={1} title="Delivery address" />

            {addingAddress || (addresses?.length ?? 0) === 0 ? (
              <div className="mt-4 border border-rule bg-card p-5">
                <AddressForm
                  submitLabel="Use this address"
                  busy={createAddress.isPending}
                  onSubmit={submitAddress}
                  onCancel={addresses?.length ? () => setAddingAddress(false) : undefined}
                />
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {addresses?.map((address) => (
                    <button
                      key={address.id}
                      onClick={() => setAddressId(address.id)}
                      className={cn(
                        'border p-4 text-left transition-colors',
                        addressId === address.id
                          ? 'border-ink bg-card ring-1 ring-ink'
                          : 'border-rule bg-card hover:border-rule-strong',
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Badge tone={addressId === address.id ? 'indigo' : 'neutral'}>
                          {address.type}
                        </Badge>
                        {address.isDefault && <Badge tone="moss">Default</Badge>}
                        {addressId === address.id && (
                          <Check className="ml-auto h-4 w-4 text-indigo" aria-hidden />
                        )}
                      </div>
                      <AddressSummary address={address} />
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setAddingAddress(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo underline underline-offset-4 hover:text-indigo-deep"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add a new address
                </button>
              </>
            )}
          </section>

          {/* ---- Payment ---- */}
          <section>
            <SectionHeading step={2} title="Payment method" />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(summary?.availablePaymentMethods ?? ['COD']).map((available) => (
                <button
                  key={available}
                  onClick={() => setMethod(available)}
                  className={cn(
                    'flex items-center justify-between border px-4 py-3 text-left transition-colors',
                    method === available
                      ? 'border-ink bg-card ring-1 ring-ink'
                      : 'border-rule bg-card hover:border-rule-strong',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">
                      {METHOD_LABELS[available].label}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {METHOD_LABELS[available].hint}
                    </span>
                  </span>
                  {method === available && <Check className="h-4 w-4 text-indigo" aria-hidden />}
                </button>
              ))}
            </div>

            {/* Says plainly why an option is missing, rather than leaving a gap. */}
            {summary && summary.availablePaymentMethods.length === 1 && (
              <p className="mt-3 text-xs text-ink-faint">
                Online payments are unavailable right now. Cash on delivery still works.
              </p>
            )}
          </section>

          {/* ---- Extras ---- */}
          <section>
            <SectionHeading step={3} title="Anything else" />

            <div className="mt-4 space-y-4">
              <label className="flex cursor-pointer items-start gap-3 border border-rule bg-card p-4">
                <input
                  type="checkbox"
                  checked={giftWrap}
                  onChange={(e) => setGiftWrap(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#2B4C7E]"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Gift className="h-4 w-4 text-ink-faint" aria-hidden />
                    Gift wrap this order
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    Adds ₹49, itemised on your receipt
                  </span>
                </span>
              </label>

              <Field label="Delivery instructions" htmlFor="note" hint="Shown to the courier">
                <Textarea
                  id="note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Leave with the security desk"
                />
              </Field>
            </div>
          </section>
        </div>

        {/* ---- The receipt ---- */}
        <aside className="lg:sticky lg:top-24">
          <div className="border border-rule bg-card p-5">
            <div className="flex items-baseline justify-between border-b border-dashed border-rule pb-3">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Order summary
              </span>
              <span className="tnum text-[11px] text-ink-faint">
                {summary?.lines.length} {summary?.lines.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <ul className="border-b border-dashed border-rule py-2">
              {summary?.lines.map((line) => (
                <li key={line.variantId} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-ink">{line.productTitle}</span>
                    <span className="tnum text-xs text-ink-faint">
                      {line.variantName} × {line.quantity}
                    </span>
                  </span>
                  <Money amount={line.lineTotal} className="shrink-0 text-sm" />
                </li>
              ))}
            </ul>

            {/* ---- Coupon ---- */}
            <div className="border-b border-dashed border-rule py-4">
              {summary?.coupon.applied ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-moss">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    <span className="tnum">{summary.coupon.code}</span> applied
                  </span>
                  <button
                    onClick={() => {
                      setAppliedCoupon(undefined);
                      setCouponInput('');
                    }}
                    className="text-xs text-ink-faint underline underline-offset-4 hover:text-vermilion"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAppliedCoupon(couponInput.trim().toUpperCase() || undefined);
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Coupon code"
                    aria-label="Coupon code"
                    className="tnum h-9 uppercase"
                  />
                  <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0">
                    Apply
                  </Button>
                </form>
              )}

              {/* The API's refusal reason is shown verbatim — it is already
                  written for shoppers and tells them what to do next. */}
              {summary?.coupon.rejectedReason && (
                <p className="mt-2 text-xs text-vermilion">{summary.coupon.rejectedReason}</p>
              )}
            </div>

            {/* ---- Totals ---- */}
            {summary && (
              <div className="pt-3">
                <ReceiptRow label="Subtotal" amount={summary.totals.subtotal} />

                {summary.totals.discount > 0 && (
                  <ReceiptRow label="Discount" amount={summary.totals.discount} tone="credit" />
                )}

                <ReceiptRow
                  label="Delivery"
                  hint={summary.totals.shipping === 0 ? undefined : 'by weight and distance'}
                >
                  {summary.totals.shipping === 0 ? (
                    <span className="tnum text-sm text-moss">Free</span>
                  ) : (
                    <Money amount={summary.totals.shipping} className="text-sm" />
                  )}
                </ReceiptRow>

                {summary.totals.giftWrap > 0 && (
                  <ReceiptRow label="Gift wrap" amount={summary.totals.giftWrap} />
                )}

                {/* The line the whole design exists for: the tax is stated, and
                    stated as already included, so nothing appears at the end. */}
                <ReceiptRow
                  label="GST"
                  hint={summary.totals.taxIncludedInPrice ? 'included above' : undefined}
                  amount={summary.totals.tax}
                  tone="muted"
                />

                <ReceiptTotal
                  amount={summary.totals.total}
                  note={
                    summary.totals.taxIncludedInPrice
                      ? 'Inclusive of all taxes. Nothing further to pay.'
                      : undefined
                  }
                />
              </div>
            )}

            {itemBlockers.length > 0 && (
              <div className="mt-4 flex gap-2 border border-vermilion/25 bg-vermilion-wash p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" aria-hidden />
                <ul className="space-y-0.5 text-xs text-vermilion">
                  {itemBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              size="lg"
              block
              className="mt-5"
              onClick={place}
              disabled={!canPlace}
              loading={placeOrder.isPending}
            >
              {method === 'COD' ? 'Place order' : 'Pay and place order'}
            </Button>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
              <Truck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Stock is held for 15 minutes while you pay. Prices are re-checked when you
              confirm.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Numbered because checkout genuinely is a sequence — address, then payment,
 * then the rest. The numbers encode real order rather than decorating headings.
 */
function SectionHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-rule pb-2">
      <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-medium text-paper">
        {step}
      </span>
      <h2 className="font-display text-lg text-ink">{title}</h2>
    </div>
  );
}
