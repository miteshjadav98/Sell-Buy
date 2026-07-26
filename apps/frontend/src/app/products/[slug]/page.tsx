import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { catalogApi } from '@/features/catalog/catalog.api';
import { ApiError } from '@/lib/api-client';
import { ProductDetailView } from './product-detail-view';
import type { ProductDetail } from '@/types/api';

export const dynamic = 'force-dynamic';

async function loadProduct(slug: string): Promise<ProductDetail | null> {
  try {
    return await catalogApi.getProduct(slug);
  } catch (error) {
    // A missing product is a 404, not a crash. Anything else is rethrown so the
    // error boundary can report a genuine outage rather than disguising it as
    // "product not found".
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug).catch(() => null);
  if (!product) return { title: 'Product not found' };

  return {
    title: product.title,
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 160),
      images: product.media[0]?.url ? [product.media[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs text-ink-faint">
        <Link href="/products" className="hover:text-indigo">
          All products
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link href={`/products?category=${product.category.slug}`} className="hover:text-indigo">
          {product.category.name}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="text-ink-muted">{product.title}</span>
      </nav>

      <ProductDetailView product={product} />
    </div>
  );
}
