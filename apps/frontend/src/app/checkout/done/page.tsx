'use client';

import { useEffect, useState } from 'react';
import { Check, Package } from 'lucide-react';
import { recallOrder } from '@/features/checkout/use-checkout';
import { ButtonLink } from '@/components/ui/button';
import { Money } from '@/components/ui/receipt';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import type { PlacedOrder } from '@/types/api';

/**
 * The confirmation, rendered as the receipt the whole site has been promising.
 *
 * It reads from sessionStorage rather than an API call because there is no
 * order-history endpoint yet — that arrives with Step 9, at which point this
 * page should fetch by order number and this fallback can go. Until then it
 * degrades honestly rather than inventing data.
 */
export default function OrderPlacedPage() {
  const [order, setOrder] = useState<PlacedOrder | null | undefined>(undefined);

  // sessionStorage is not available during server rendering, so the read waits
  // for the client.
  useEffect(() => setOrder(recallOrder()), []);

  if (order === undefined) return <PageSpinner label="Loading your order" />;

  if (!order) {
    return (
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title="No recent order to show"
        body="Order history arrives with the orders module. If you just placed an order, the confirmation was sent to your email."
        actionLabel="Back to the storefront"
        actionHref="/"
      />
    );
  }

  const isCod = order.payment.method === 'COD';

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rise border border-rule bg-card p-7">
        <div className="flex items-center gap-3 border-b border-dashed border-rule pb-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-moss-wash text-moss">
            <Check className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl tracking-tight text-ink">
              {isCod ? 'Order placed' : 'Order confirmed'}
            </h1>
            <p className="text-sm text-ink-muted">
              {isCod
                ? 'Pay the courier when it arrives.'
                : 'Payment received. We are getting it ready.'}
            </p>
          </div>
        </div>

        <dl className="py-4">
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-sm text-ink-muted">Order number</dt>
            <dd className="tnum text-sm font-medium text-ink">{order.orderNumber}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-sm text-ink-muted">Status</dt>
            <dd className="text-sm text-ink">{order.status.replace(/_/g, ' ').toLowerCase()}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-sm text-ink-muted">Payment</dt>
            <dd className="text-sm text-ink">
              {isCod ? 'Cash on delivery' : order.payment.method.replace(/_/g, ' ')}
            </dd>
          </div>
        </dl>

        <div className="border-t border-ink pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-ink">
              {isCod ? 'Due on delivery' : 'Paid'}
            </span>
            <Money amount={order.total} className="text-lg font-semibold text-ink" />
          </div>
          <p className="mt-1 text-right text-xs text-ink-faint">Inclusive of all taxes</p>
        </div>

        {/* Honest about the one thing that is not finished, rather than
            pretending the gateway handshake happened. */}
        {order.payment.requiresClientAction && (
          <p className="mt-5 border border-rule bg-paper p-3 text-xs leading-relaxed text-ink-muted">
            This order is awaiting payment confirmation from{' '}
            {order.payment.gateway.toLowerCase()}. The gateway checkout sheet is not wired up in
            this build — the order is held for 15 minutes and released after that if payment
            does not arrive.
          </p>
        )}

        <div className="mt-6 grid gap-2">
          <ButtonLink href="/products" block>
            Keep shopping
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
