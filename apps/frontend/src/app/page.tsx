import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { catalogApi } from '@/features/catalog/catalog.api';
import { ProductGrid } from '@/components/product/product-card';
import { HeroReceipt } from '@/components/home/hero-receipt';
import { ButtonLink } from '@/components/ui/button';
import type { CategoryNode, ProductListItem } from '@/types/api';

/**
 * Rendered per request rather than prerendered.
 *
 * The catalogue changes whenever a seller lists something or an admin approves
 * it, and — more practically — `next build` must not require a running API and a
 * seeded database to succeed.
 */
export const dynamic = 'force-dynamic';

/**
 * The storefront must render even when the API does not.
 *
 * A home page that 500s because the catalogue service is restarting is a worse
 * outage than one that shows its hero and an honest empty state. The two fetches
 * degrade independently.
 */
async function loadHome(): Promise<{
  products: ProductListItem[];
  categories: CategoryNode[];
  apiReachable: boolean;
}> {
  const [productsResult, categoriesResult] = await Promise.allSettled([
    catalogApi.listProducts({ sort: 'popular', limit: 8 }),
    catalogApi.getCategories(),
  ]);

  return {
    products: productsResult.status === 'fulfilled' ? productsResult.value.items : [],
    categories: categoriesResult.status === 'fulfilled' ? categoriesResult.value : [],
    apiReachable: productsResult.status === 'fulfilled',
  };
}

export default async function HomePage() {
  const { products, categories, apiReachable } = await loadHome();

  return (
    <>
      {/* ---- Hero: the thesis, demonstrated rather than claimed ---- */}
      <section className="border-b border-rule bg-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_auto] lg:items-center lg:py-24">
          <div className="rise">
            <p className="text-[11px] uppercase tracking-[0.18em] text-indigo">
              Multi-vendor marketplace
            </p>

            <h1 className="mt-4 max-w-xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              The price you see is the price you pay.
            </h1>

            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-muted">
              GST is already inside every figure on this site. Delivery is quoted before you
              reach the payment step, and the total on your receipt is the total you agreed to.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/products" size="lg">
                Browse everything
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              {categories[0] && (
                <ButtonLink
                  href={`/products?category=${categories[0].slug}`}
                  variant="outline"
                  size="lg"
                >
                  {categories[0].name}
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="rise flex lg:justify-end" style={{ animationDelay: '90ms' }}>
            <HeroReceipt />
          </div>
        </div>
      </section>

      {/* ---- Categories ---- */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <h2 className="font-display text-xl text-ink">Shop by category</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.slice(0, 12).map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="rounded-[--radius-card] border border-rule bg-card px-3.5 py-2 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Products ---- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl text-ink">Popular right now</h2>
          <Link
            href="/products"
            className="text-sm text-indigo underline underline-offset-4 hover:text-indigo-deep"
          >
            See all
          </Link>
        </div>

        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <div className="border border-dashed border-rule-strong bg-card px-6 py-16 text-center">
            <p className="font-display text-lg text-ink">
              {apiReachable ? 'No products listed yet' : 'The catalogue is not responding'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              {apiReachable
                ? 'Once sellers list products and an admin approves them, they appear here.'
                : 'Start the API on port 4000 and reload. Everything else on this page still works.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
