'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Minus, Plus, ShoppingBag, Store } from 'lucide-react';
import { useAddToCart } from '@/features/cart/use-cart';
import { Button } from '@/components/ui/button';
import { Money, PriceBlock } from '@/components/ui/receipt';
import { Badge, Rating } from '@/components/ui/misc';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import type { ProductDetail, ProductVariant } from '@/types/api';

/**
 * Product detail, built around the variant picker.
 *
 * The variant — not the product — is what has a price, a SKU and stock, so
 * everything on the right-hand side reads from the selected variant and updates
 * together. Choosing "256GB" changing the price but not the SKU is the classic
 * bug here, and it is avoided by deriving both from one piece of state.
 */
export function ProductDetailView({ product }: { product: ProductDetail }) {
  const defaultVariant =
    product.variants.find((variant) => variant.isDefault) ?? product.variants[0];

  const [selection, setSelection] = useState<Record<string, string>>(
    () => defaultVariant?.options ?? {},
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const { addToCart, isPending } = useAddToCart();
  const openCart = useUiStore((s) => s.openCart);

  /**
   * The variant matching every chosen option. When a combination does not
   * exist — which happens the moment someone picks "Blue" for a size that only
   * comes in black — this is undefined and the buy button says so, rather than
   * silently adding something else.
   */
  const selectedVariant: ProductVariant | undefined = useMemo(
    () =>
      product.variants.find((variant) =>
        Object.entries(selection).every(([name, value]) => variant.options[name] === value),
      ),
    [product.variants, selection],
  );

  /** Option values that lead to a real variant, given what else is chosen. */
  const isCombinationAvailable = (optionName: string, value: string): boolean =>
    product.variants.some((variant) => {
      if (variant.options[optionName] !== value) return false;
      return Object.entries(selection).every(
        ([name, chosen]) => name === optionName || variant.options[name] === chosen,
      );
    });

  const images = product.media.filter((m) => m.type === 'IMAGE' || !m.type);
  const price = selectedVariant?.price ?? product.variants[0]?.price ?? 0;
  const compareAt = selectedVariant?.compareAtPrice ?? null;

  const handleAdd = () => {
    if (!selectedVariant) return;
    addToCart(selectedVariant.id, quantity);
    openCart();
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      {/* ---- Gallery ---- */}
      <div className="space-y-3">
        <div className="relative aspect-square w-full overflow-hidden border border-rule bg-card">
          {images[activeImage]?.url ? (
            <Image
              src={images[activeImage].url}
              alt={images[activeImage].altText ?? product.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
              unoptimized
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-ink-faint">No image</div>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((media, index) => (
              <button
                key={media.url + index}
                onClick={() => setActiveImage(index)}
                aria-label={`View image ${index + 1}`}
                aria-current={index === activeImage}
                className={cn(
                  'relative h-16 w-16 shrink-0 overflow-hidden border bg-card transition-colors',
                  index === activeImage ? 'border-ink' : 'border-rule hover:border-rule-strong',
                )}
              >
                <Image
                  src={media.thumbnailUrl ?? media.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- Buy panel ---- */}
      <div>
        {product.brand && (
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            {product.brand.name}
          </p>
        )}

        <h1 className="mt-1.5 font-display text-3xl leading-tight tracking-tight text-ink">
          {product.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Rating value={product.ratingAverage} count={product.ratingCount} />
          {product.totalSold > 0 && (
            <span className="tnum text-xs text-ink-faint">
              {product.totalSold.toLocaleString('en-IN')} sold
            </span>
          )}
        </div>

        <div className="mt-5 border-t border-rule pt-5">
          <PriceBlock price={price} compareAt={compareAt} size="lg" />
          {/* The tax line is stated up front, not buried at checkout. It is the
              same claim the hero makes, kept honest on every product. */}
          <p className="mt-1.5 text-xs text-ink-faint">
            Inclusive of {product.taxRate}% GST · delivery calculated at checkout
          </p>
        </div>

        {/* ---- Options ---- */}
        {product.options.length > 0 && (
          <div className="mt-6 space-y-4">
            {product.options.map((option) => (
              <div key={option.name}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                    {option.name}
                  </span>
                  <span className="text-sm text-ink">{selection[option.name]}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const available = isCombinationAvailable(option.name, value.value);
                    const active = selection[option.name] === value.value;

                    return (
                      <button
                        key={value.value}
                        onClick={() =>
                          setSelection((prev) => ({ ...prev, [option.name]: value.value }))
                        }
                        // Unavailable combinations stay clickable but are marked:
                        // hiding them makes the picker jump around as choices
                        // change, which is more confusing than a struck-out chip.
                        className={cn(
                          'flex items-center gap-1.5 rounded-[--radius-card] border px-3 py-2 text-sm transition-colors',
                          active
                            ? 'border-ink bg-ink text-paper'
                            : 'border-rule-strong bg-card text-ink hover:border-ink',
                          !available && !active && 'text-ink-faint line-through',
                        )}
                      >
                        {value.hexCode && (
                          <span
                            className="h-3 w-3 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: value.hexCode }}
                            aria-hidden
                          />
                        )}
                        {value.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- Quantity + buy ---- */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-[--radius-card] border border-rule-strong bg-card">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="grid h-11 w-10 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="tnum w-10 text-center text-sm" aria-live="polite">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              disabled={quantity >= 10}
              className="grid h-11 w-10 place-items-center text-ink-muted hover:text-indigo disabled:opacity-35"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <Button
            size="lg"
            onClick={handleAdd}
            loading={isPending}
            disabled={!selectedVariant}
            className="flex-1 sm:flex-none sm:px-10"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {selectedVariant ? 'Add to cart' : 'Unavailable combination'}
          </Button>
        </div>

        {selectedVariant && (
          <p className="tnum mt-3 text-xs text-ink-faint">SKU {selectedVariant.sku}</p>
        )}

        {/* ---- Seller ---- */}
        <div className="mt-6 flex items-center gap-3 border-t border-rule pt-5">
          <Store className="h-4 w-4 text-ink-faint" aria-hidden />
          <div className="text-sm">
            <span className="text-ink-muted">Sold by </span>
            <span className="font-medium text-ink">{product.seller.businessName}</span>
          </div>
          {product.seller.rating > 0 && (
            <Badge tone="moss">{product.seller.rating.toFixed(1)} seller rating</Badge>
          )}
        </div>

        {/* ---- Highlights ---- */}
        {product.highlights.length > 0 && (
          <ul className="mt-6 space-y-2">
            {product.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2 text-sm text-ink-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden />
                {highlight}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Description + specs, full width under both columns ---- */}
      <div className="lg:col-span-2">
        <div className="grid gap-10 border-t border-rule pt-10 md:grid-cols-2">
          <section>
            <h2 className="font-display text-lg text-ink">Description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {product.description}
            </p>
          </section>

          {product.specifications.length > 0 && (
            <section>
              <h2 className="font-display text-lg text-ink">Specifications</h2>
              <dl className="mt-3">
                {product.specifications.map((spec) => (
                  <div
                    key={`${spec.group}-${spec.key}`}
                    className="flex justify-between gap-6 border-b border-rule py-2 text-sm last:border-0"
                  >
                    <dt className="text-ink-muted">{spec.key}</dt>
                    <dd className="text-right text-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        {/* Variant price table — the receipt grammar applied to the catalogue. */}
        {product.variants.length > 1 && (
          <section className="mt-10 border-t border-rule pt-10">
            <h2 className="font-display text-lg text-ink">All variants</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-rule text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                    <th className="py-2 text-left font-normal">Variant</th>
                    <th className="py-2 text-left font-normal">SKU</th>
                    <th className="py-2 text-right font-normal">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => (
                    <tr key={variant.id} className="border-b border-rule last:border-0">
                      <td className="py-2 text-ink">{variant.name}</td>
                      <td className="tnum py-2 text-xs text-ink-faint">{variant.sku}</td>
                      <td className="py-2 text-right">
                        <Money amount={variant.price} compact className="text-ink" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
