import { Suspense } from 'react';
import type { Metadata } from 'next';
import { catalogApi } from '@/features/catalog/catalog.api';
import { ProductBrowser } from './product-browser';
import { PageSpinner } from '@/components/ui/misc';
import type { Brand, CategoryNode } from '@/types/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Browse',
  description: 'Every product on Sell-Buy, filterable by category, brand and price.',
};

/**
 * The shell is a server component so the filter vocabulary (categories, brands)
 * is in the HTML — those lists are stable, cacheable and worth having without
 * a round-trip. The products themselves are fetched client-side by
 * `ProductBrowser`, because filtering and "load more" are interactions, and
 * round-tripping the server for each one would make the page feel like 2005.
 */
export default async function ProductsPage() {
  const [categoriesResult, brandsResult] = await Promise.allSettled([
    catalogApi.getCategories(),
    catalogApi.getBrands(),
  ]);

  const categories: CategoryNode[] =
    categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const brands: Brand[] = brandsResult.status === 'fulfilled' ? brandsResult.value : [];

  return (
    <Suspense fallback={<PageSpinner label="Loading catalogue" />}>
      <ProductBrowser categories={categories} brands={brands} />
    </Suspense>
  );
}
