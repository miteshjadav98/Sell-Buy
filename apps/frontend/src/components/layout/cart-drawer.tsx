'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/features/cart/use-cart';
import { Money, ReceiptRow, ReceiptTotal } from '@/components/ui/receipt';
import { ButtonLink } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { useUiStore } from '@/store/ui.store';

/**
 * The cart, one keystroke away from anywhere.
 *
 * It shows the subtotal and says plainly that delivery and tax are settled at
 * checkout — rather than showing a "total" that is about to change. A number
 * that moves between the drawer and the checkout screen is exactly the surprise
 * this whole design exists to avoid.
 */
export function CartDrawer() {
  const open = useUiStore((s) => s.cartOpen);
  const close = useUiStore((s) => s.closeCart);

  const { data: cart, isLoading } = useCart();
  const { setQuantity, isPending: updating } = useUpdateCartItem();
  const { remove, isPending: removing } = useRemoveCartItem();

  // Escape closes, and the page behind stops scrolling — otherwise the drawer
  // floats over a moving background, which feels broken on touch.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  if (!open) return null;

  const items = cart?.items ?? [];
  const busy = updating || removing;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Cart">
      <button
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={close}
        aria-label="Close cart"
        tabIndex={-1}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-rule bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 className="font-display text-lg text-ink">
            Cart
            {items.length > 0 && (
              <span className="tnum ml-2 text-sm font-normal text-ink-faint">
                {cart?.summary.totalQuantity}
              </span>
            )}
          </h2>
          <button
            onClick={close}
            className="grid h-8 w-8 place-items-center rounded-[--radius-card] text-ink-muted hover:bg-paper hover:text-ink"
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-ink-faint" aria-hidden />
              <p className="mt-4 font-display text-base text-ink">Nothing here yet</p>
              <p className="mt-1 text-sm text-ink-muted">
                Browse the catalogue and add something to get started.
              </p>
              <ButtonLink href="/products" className="mt-5" onClick={close}>
                Browse products
              </ButtonLink>
            </div>
          ) : (
            <ul>
              {items.map((line) => (
                <li key={line.itemId} className="flex gap-3 border-b border-rule px-5 py-4">
                  <Link
                    href={`/products/${line.productSlug}`}
                    onClick={close}
                    className="relative h-20 w-16 shrink-0 overflow-hidden rounded-[--radius-card] bg-paper ring-1 ring-rule"
                  >
                    {line.imageUrl ? (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-[10px] text-ink-faint">
                        No image
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${line.productSlug}`}
                      onClick={close}
                      className="line-clamp-2 text-sm font-medium text-ink hover:text-indigo"
                    >
                      {line.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-faint">{line.variantName}</p>

                    {!line.purchasable && (
                      <p className="mt-1 text-xs text-vermilion">No longer available</p>
                    )}
                    {line.purchasable && line.exceedsStock && (
                      <p className="tnum mt-1 text-xs text-vermilion">
                        Only {line.available} left
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-[--radius-card] ring-1 ring-rule-strong">
                        <button
                          onClick={() => setQuantity(line.itemId, line.quantity - 1)}
                          disabled={busy || line.quantity <= 1}
                          className="grid h-7 w-7 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
                          aria-label={`Decrease quantity of ${line.title}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="tnum w-7 text-center text-xs">{line.quantity}</span>
                        <button
                          onClick={() => setQuantity(line.itemId, line.quantity + 1)}
                          disabled={busy || line.quantity >= line.available}
                          className="grid h-7 w-7 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
                          aria-label={`Increase quantity of ${line.title}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Money amount={line.lineTotal} className="text-sm font-medium" />
                        <button
                          onClick={() => remove(line.itemId)}
                          disabled={busy}
                          className="grid h-7 w-7 place-items-center rounded-[--radius-card] text-ink-faint hover:bg-vermilion-wash hover:text-vermilion"
                          aria-label={`Remove ${line.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && cart && (
          <div className="border-t border-rule bg-paper px-5 py-4">
            <ReceiptRow label="Subtotal" amount={cart.summary.subtotal} />
            {cart.summary.totalSavings > 0 && (
              <ReceiptRow label="You save" amount={cart.summary.totalSavings} tone="credit" />
            )}
            <ReceiptTotal
              label="Subtotal"
              amount={cart.summary.subtotal}
              note="Delivery and GST are itemised at checkout"
            />

            <div className="mt-4 grid gap-2">
              <ButtonLink href="/checkout" size="lg" block onClick={close}>
                Checkout
              </ButtonLink>
              <ButtonLink href="/cart" variant="ghost" size="sm" block onClick={close}>
                View full cart
              </ButtonLink>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
