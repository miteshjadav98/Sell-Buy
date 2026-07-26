import Image from 'next/image';
import Link from 'next/link';
import { PriceBlock } from '@/components/ui/receipt';
import { Rating } from '@/components/ui/misc';
import type { ProductListItem } from '@/types/api';

/**
 * A product card as a ledger line rather than a floating tile.
 *
 * No drop shadow, no rounded pillow — cards are separated by the same hairline
 * that separates line items on an invoice, and the price sits in the mono column
 * where every other figure on the site sits. The effect is a grid you scan down
 * by price, which is how people actually shop a category.
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const hasRange = product.maxPrice > product.minPrice;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col border border-rule bg-card transition-colors hover:border-ink"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-paper">
        {product.primaryImageUrl ? (
          <Image
            src={product.primaryImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-ink-faint">No image</div>
        )}

        {product.isFeatured && (
          <span className="absolute left-0 top-3 bg-ink px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-paper">
            Featured
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brandName && (
          <span className="text-[11px] uppercase tracking-wider text-ink-faint">
            {product.brandName}
          </span>
        )}

        <h3 className="line-clamp-2 text-sm leading-snug text-ink group-hover:text-indigo">
          {product.title}
        </h3>

        <div className="mt-auto space-y-1.5 pt-1.5">
          <Rating value={product.ratingAverage} count={product.ratingCount} />
          <PriceBlock price={product.minPrice} compareAt={product.compareAtPrice} size="sm" />
          {/* A range is stated, not hidden behind "from" — the customer is
              choosing a variant next and should know the spread up front. */}
          {hasRange && (
            <p className="tnum text-[11px] text-ink-faint">
              up to ₹{product.maxPrice.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
