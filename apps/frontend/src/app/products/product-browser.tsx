'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { catalogApi } from '@/features/catalog/catalog.api';
import { ProductGrid } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import type { Brand, CategoryNode, ProductSort } from '@/types/api';
import { cn } from '@/lib/utils';

const SORTS: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'rating', label: 'Best rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

/**
 * Filters live in the URL, not in component state.
 *
 * That is the difference between a filtered view someone can send to a friend,
 * bookmark, or reach with the back button — and one that silently resets the
 * moment they tap a product and return. The URL is the state; React reads it.
 */
export function ProductBrowser({
  categories,
  brands,
}: {
  categories: CategoryNode[];
  brands: Brand[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const query = useMemo(
    () => ({
      q: params.get('q') ?? undefined,
      category: params.get('category') ?? undefined,
      brands: params.get('brands') ?? undefined,
      minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
      maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
      sort: (params.get('sort') as ProductSort) ?? 'newest',
    }),
    [params],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      router.push(`/products?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const selectedBrands = query.brands?.split(',').filter(Boolean) ?? [];

  const toggleBrand = (slug: string) => {
    const next = selectedBrands.includes(slug)
      ? selectedBrands.filter((b) => b !== slug)
      : [...selectedBrands, slug];
    setParam('brands', next.join(','));
  };

  /**
   * Cursor pagination, matching the API. `getNextPageParam` returns undefined
   * when `hasNext` is false, which is what stops React Query asking for a page
   * that does not exist.
   */
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery({
      queryKey: ['catalog', 'browse', query],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) => catalogApi.listProducts({ ...query, cursor: pageParam, limit: 24 }),
      getNextPageParam: (lastPage) =>
        lastPage.meta.hasNext ? lastPage.meta.nextCursor : undefined,
    });

  const products = data?.pages.flatMap((page) => page.items) ?? [];
  const activeFilters = [
    query.category && { key: 'category', label: categoryName(categories, query.category) },
    ...selectedBrands.map((slug) => ({
      key: `brand:${slug}`,
      label: brands.find((b) => b.slug === slug)?.name ?? slug,
    })),
    query.minPrice !== undefined && { key: 'minPrice', label: `Above ₹${query.minPrice}` },
    query.maxPrice !== undefined && { key: 'maxPrice', label: `Under ₹${query.maxPrice}` },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const clearFilter = (key: string) => {
    if (key.startsWith('brand:')) return toggleBrand(key.slice(6));
    setParam(key, null);
  };

  const clearAll = () => router.push(query.q ? `/products?q=${encodeURIComponent(query.q)}` : '/products');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          {query.q ? `Results for “${query.q}”` : query.category ? categoryName(categories, query.category) : 'Everything'}
        </h1>
        {!isLoading && (
          <p className="tnum mt-1 text-sm text-ink-muted">
            {products.length}
            {hasNextPage ? '+' : ''} {products.length === 1 ? 'product' : 'products'}
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        {/* ---- Filters ---- */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <SlidersHorizontal className="h-4 w-4 text-ink-faint" aria-hidden />
            Filters
          </div>

          <FilterGroup label="Sort">
            <select
              value={query.sort}
              onChange={(e) => setParam('sort', e.target.value)}
              className="h-9 w-full rounded-[--radius-card] border border-rule-strong bg-card px-2 text-sm focus:border-indigo focus:outline-none"
              aria-label="Sort products"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterGroup>

          {categories.length > 0 && (
            <FilterGroup label="Category">
              <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() =>
                      setParam('category', query.category === category.slug ? null : category.slug)
                    }
                    className={cn(
                      'block w-full truncate rounded-[--radius-chip] px-2 py-1.5 text-left text-sm transition-colors',
                      query.category === category.slug
                        ? 'bg-indigo-wash font-medium text-indigo'
                        : 'text-ink-muted hover:bg-paper hover:text-ink',
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </FilterGroup>
          )}

          {brands.length > 0 && (
            <FilterGroup label="Brand">
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {brands.map((brand) => (
                  <label
                    key={brand.id}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm text-ink-muted hover:text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(brand.slug)}
                      onChange={() => toggleBrand(brand.slug)}
                      className="h-3.5 w-3.5 accent-[#2B4C7E]"
                    />
                    {brand.name}
                  </label>
                ))}
              </div>
            </FilterGroup>
          )}

          <FilterGroup label="Price">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Min"
                defaultValue={query.minPrice}
                onBlur={(e) => setParam('minPrice', e.target.value)}
                aria-label="Minimum price"
                className="tnum h-9 w-full rounded-[--radius-card] border border-rule-strong bg-card px-2 text-sm focus:border-indigo focus:outline-none"
              />
              <span className="text-ink-faint">–</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Max"
                defaultValue={query.maxPrice}
                onBlur={(e) => setParam('maxPrice', e.target.value)}
                aria-label="Maximum price"
                className="tnum h-9 w-full rounded-[--radius-card] border border-rule-strong bg-card px-2 text-sm focus:border-indigo focus:outline-none"
              />
            </div>
          </FilterGroup>
        </aside>

        {/* ---- Results ---- */}
        <div>
          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => clearFilter(filter.key)}
                  className="inline-flex items-center gap-1.5 rounded-[--radius-chip] bg-indigo-wash px-2 py-1 text-xs text-indigo hover:bg-indigo/15"
                >
                  {filter.label}
                  <X className="h-3 w-3" aria-hidden />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button
                onClick={clearAll}
                className="text-xs text-ink-faint underline underline-offset-4 hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              body={
                error instanceof Error
                  ? error.message
                  : 'The catalogue did not respond. Check that the API is running.'
              }
              onRetry={() => refetch()}
            />
          ) : products.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              body="Try removing a filter or widening the price range."
              actionLabel="Clear filters"
              actionHref="/products"
            />
          ) : (
            <>
              <ProductGrid products={products} />
              {hasNextPage && (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => fetchNextPage()}
                    loading={isFetchingNextPage}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-4 first-of-type:border-0 first-of-type:pt-0">
      <h2 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</h2>
      {children}
    </div>
  );
}

function categoryName(categories: CategoryNode[], slug: string): string {
  return categories.find((c) => c.slug === slug)?.name ?? slug;
}
