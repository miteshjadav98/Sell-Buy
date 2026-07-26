'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, BookmarkPlus, Minus, Plus, ShoppingBag, Trash2, Undo2 } from 'lucide-react';
import {
  useCart,
  useClearCart,
  useRemoveCartItem,
  useSaveForLater,
  useUpdateCartItem,
} from '@/features/cart/use-cart';
import { ButtonLink } from '@/components/ui/button';
import { Money, PriceBlock, ReceiptRow, ReceiptTotal } from '@/components/ui/receipt';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import type { CartLine } from '@/types/api';

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { setQuantity, isPending: updating } = useUpdateCartItem();
  const { remove, isPending: removing } = useRemoveCartItem();
  const { setSaved } = useSaveForLater();
  const { clear } = useClearCart();

  if (isLoading) return <PageSpinner label="Loading your cart" />;

  const items = cart?.items ?? [];
  const saved = cart?.savedForLater ?? [];
  const busy = updating || removing;

  if (items.length === 0 && saved.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Your cart is empty"
        body="Browse the catalogue and add something to get started."
        actionLabel="Browse products"
        actionHref="/products"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl tracking-tight text-ink">Cart</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div>
          {/* The banner names the specific problem, because "there is an issue
              with your cart" gives the reader nothing to act on. */}
          {cart?.summary.hasIssues && (
            <div className="mb-5 flex gap-3 border border-vermilion/25 bg-vermilion-wash px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" aria-hidden />
              <p className="text-sm text-vermilion">
                Some items need attention before checkout — see the notes below.
              </p>
            </div>
          )}

          {items.length > 0 ? (
            <ul className="border-t border-rule">
              {items.map((line) => (
                <CartRow
                  key={line.itemId}
                  line={line}
                  busy={busy}
                  onQuantity={setQuantity}
                  onRemove={remove}
                  onSave={(id) => setSaved(id, true)}
                />
              ))}
            </ul>
          ) : (
            <p className="border-y border-rule py-8 text-center text-sm text-ink-muted">
              Nothing in the cart. Your saved items are below.
            </p>
          )}

          {items.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={clear}
                className="text-xs text-ink-faint underline underline-offset-4 hover:text-vermilion"
              >
                Empty cart
              </button>
            </div>
          )}

          {saved.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl text-ink">Saved for later</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Kept out of your total until you move them back.
              </p>
              <ul className="mt-4 border-t border-rule">
                {saved.map((line) => (
                  <CartRow
                    key={line.itemId}
                    line={line}
                    busy={busy}
                    savedMode
                    onQuantity={setQuantity}
                    onRemove={remove}
                    onSave={(id) => setSaved(id, false)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---- Summary ---- */}
        {items.length > 0 && cart && (
          <aside className="border border-rule bg-card p-5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg text-ink">Summary</h2>

            <div className="mt-4">
              <ReceiptRow
                label="Items"
                hint={`${cart.summary.distinctItems} line${cart.summary.distinctItems === 1 ? '' : 's'}`}
              >
                <span className="tnum text-sm text-ink">{cart.summary.totalQuantity}</span>
              </ReceiptRow>

              {cart.summary.totalMrp > cart.summary.subtotal && (
                <ReceiptRow label="List price" amount={cart.summary.totalMrp} tone="muted" />
              )}
              {cart.summary.totalSavings > 0 && (
                <ReceiptRow label="You save" amount={cart.summary.totalSavings} tone="credit" />
              )}

              <ReceiptTotal
                label="Subtotal"
                amount={cart.summary.subtotal}
                note="GST is included. Delivery is calculated at checkout."
              />
            </div>

            <ButtonLink href="/checkout" size="lg" block className="mt-5">
              Checkout
            </ButtonLink>

            <Link
              href="/products"
              className="mt-3 block text-center text-xs text-ink-muted underline underline-offset-4 hover:text-indigo"
            >
              Keep browsing
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

function CartRow({
  line,
  busy,
  savedMode,
  onQuantity,
  onRemove,
  onSave,
}: {
  line: CartLine;
  busy: boolean;
  savedMode?: boolean;
  onQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onSave: (itemId: string) => void;
}) {
  return (
    <li className="flex gap-4 border-b border-rule py-5">
      <Link
        href={`/products/${line.productSlug}`}
        className="relative h-28 w-24 shrink-0 overflow-hidden border border-rule bg-paper"
      >
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt="" fill sizes="96px" className="object-cover" unoptimized />
        ) : (
          <span className="grid h-full place-items-center text-[10px] text-ink-faint">No image</span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/products/${line.productSlug}`}
          className="text-sm font-medium text-ink hover:text-indigo"
        >
          {line.title}
        </Link>
        <p className="mt-0.5 text-xs text-ink-faint">{line.variantName}</p>

        <div className="mt-2">
          <PriceBlock price={line.unitPrice} compareAt={line.compareAtPrice} size="sm" />
        </div>

        {/* Every warning names the item's specific problem and what it means. */}
        <div className="mt-1.5 space-y-0.5">
          {!line.purchasable && (
            <p className="text-xs text-vermilion">
              No longer available — remove it to check out.
            </p>
          )}
          {line.purchasable && !line.inStock && (
            <p className="text-xs text-vermilion">Out of stock</p>
          )}
          {line.purchasable && line.inStock && line.exceedsStock && (
            <p className="tnum text-xs text-vermilion">
              Only {line.available} left — reduce the quantity to continue.
            </p>
          )}
          {line.priceChanged && (
            <p className="text-xs text-ink-faint">
              Price changed since you added this. The new price is shown.
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
          {!savedMode && (
            <div className="flex items-center rounded-[--radius-card] border border-rule-strong">
              <button
                onClick={() => onQuantity(line.itemId, line.quantity - 1)}
                disabled={busy || line.quantity <= 1}
                className="grid h-8 w-8 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
                aria-label={`Decrease quantity of ${line.title}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="tnum w-8 text-center text-sm">{line.quantity}</span>
              <button
                onClick={() => onQuantity(line.itemId, line.quantity + 1)}
                disabled={busy || line.quantity >= line.available}
                className="grid h-8 w-8 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
                aria-label={`Increase quantity of ${line.title}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={() => onSave(line.itemId)}
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-indigo"
          >
            {savedMode ? (
              <>
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Move to cart
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
                Save for later
              </>
            )}
          </button>

          <button
            onClick={() => onRemove(line.itemId)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-vermilion"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>

          {!savedMode && (
            <Money amount={line.lineTotal} className="ml-auto text-sm font-medium text-ink" />
          )}
        </div>
      </div>
    </li>
  );
}
