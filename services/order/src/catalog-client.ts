import { AppError } from '@sellbuy/common';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:4002';

export interface CatalogProduct {
  id: string;
  shopId: string;
  sellerId: string;
  title: string;
  price: number;
  stock: number;
  active: boolean;
}

/**
 * Checkout reads product details straight from the catalog API rather than
 * over the bus: the price and seller must be correct at the moment the order
 * is written, and an eventually-consistent local copy could be stale.
 * State changes still travel as events — this is a read, not a command.
 */
export async function fetchProduct(productId: string): Promise<CatalogProduct> {
  let response: Response;
  try {
    response = await fetch(`${CATALOG_URL}/api/products/${productId}`);
  } catch {
    throw new AppError(503, 'Catalog service is unavailable');
  }

  if (response.status === 404) throw new AppError(404, `Product not found: ${productId}`);
  if (!response.ok) throw new AppError(502, 'Could not read product from catalog');

  const body = (await response.json()) as { product: CatalogProduct };
  return body.product;
}
