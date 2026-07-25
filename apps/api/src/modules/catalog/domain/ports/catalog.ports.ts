import { ProductStatus } from '@prisma/client';
import { PaginatedResult } from '../../../../core/application/pagination';
import { Product } from '../entities/product.entity';

/**
 * Ports for the catalog feature — the contracts the use cases depend on,
 * declared in the layer that consumes them so infrastructure conforms to the
 * application, never the other way round (Dependency Inversion).
 *
 * Reads and writes are separated (Interface Segregation): the storefront only
 * ever reads, so it is handed a repository that physically cannot mutate a
 * catalogue, and a test double for a listing query never has to implement
 * `create`.
 */

export const PRODUCT_READ_REPOSITORY = Symbol('PRODUCT_READ_REPOSITORY');
export const PRODUCT_WRITE_REPOSITORY = Symbol('PRODUCT_WRITE_REPOSITORY');
export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
export const SELLER_LOOKUP = Symbol('SELLER_LOOKUP');

// ---------------------------------------------------------------------------
// Read models — plain query-side shapes with no behaviour. The write side deals
// in the Product entity; the read side returns exactly what a page renders, so
// the storefront never over-fetches to reconstruct an aggregate it won't mutate.
// ---------------------------------------------------------------------------

export interface ProductListItem {
  id: string;
  slug: string;
  title: string;
  brandName: string | null;
  categoryName: string;
  ratingAverage: number;
  ratingCount: number;
  minPrice: number;
  maxPrice: number;
  /** Highest struck-through price across variants, for the "X% off" badge. */
  compareAtPrice: number | null;
  primaryImageUrl: string | null;
  isFeatured: boolean;
}

export interface ProductDetailVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  isDefault: boolean;
  /** Option name → value, e.g. { Color: 'Blue', Storage: '256GB' }. */
  options: Record<string, string>;
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  highlights: string[];
  status: ProductStatus;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string };
  seller: { businessName: string; slug: string; rating: number };
  ratingAverage: number;
  ratingCount: number;
  totalSold: number;
  taxRate: number;
  options: Array<{ name: string; values: Array<{ value: string; hexCode: string | null }> }>;
  variants: ProductDetailVariant[];
  media: Array<{ url: string; thumbnailUrl: string | null; altText: string | null; type: string }>;
  specifications: Array<{ group: string; key: string; value: string }>;
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular';

export interface ProductQuery {
  categorySlug?: string;
  brandSlugs?: string[];
  sellerId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSort;
  cursor?: string;
  limit: number;
}

export interface IProductReadRepository {
  /** Storefront listing — ACTIVE products only, cursor-paginated. */
  list(query: ProductQuery): Promise<PaginatedResult<ProductListItem>>;
  /** Public detail page. Returns null for a missing or non-live product. */
  findDetailBySlug(slug: string): Promise<ProductDetail | null>;
  /** A seller's own catalogue, any status — offset-paginated for the dashboard. */
  listForSeller(
    sellerId: string,
    params: { status?: ProductStatus; page: number; limit: number },
  ): Promise<PaginatedResult<ProductListItem>>;
}

export interface CreateVariantData {
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  weightGrams?: number;
  isDefault?: boolean;
  /** Option name → chosen value, matched against the product's options. */
  optionValues: Record<string, string>;
}

export interface CreateProductData {
  sellerId: string;
  categoryId: string;
  brandId?: string;
  title: string;
  /** Already resolved to a unique value by the use case. */
  slug: string;
  description: string;
  highlights: string[];
  taxRate?: number;
  options: Array<{ name: string; values: Array<{ value: string; hexCode?: string }> }>;
  variants: CreateVariantData[];
  media: Array<{ url: string; thumbnailUrl?: string; altText?: string; type?: 'IMAGE' | 'VIDEO' }>;
  specifications: Array<{ group: string; key: string; value: string }>;
}

export interface IProductWriteRepository {
  /** Persists a product with its options, variants, media and specs atomically. */
  create(data: CreateProductData): Promise<Product>;
  /** Loads the aggregate (with variant snapshots) for a lifecycle transition. */
  findById(id: string): Promise<Product | null>;
  /** Persists a status change decided by the entity. */
  updateStatus(id: string, status: ProductStatus, publishedAt: Date | null): Promise<void>;
  /** True if a slug is already taken — drives unique-slug generation. */
  slugExists(slug: string): Promise<boolean>;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  iconUrl: string | null;
  productCount?: number;
  children: CategoryNode[];
}

export interface CreateCategoryData {
  name: string;
  slug: string;
  parentId?: string;
  description?: string;
  imageUrl?: string;
  iconUrl?: string;
}

export interface ICategoryRepository {
  /** The active category tree, assembled from the flat rows in one pass. */
  getTree(): Promise<CategoryNode[]>;
  findBySlug(slug: string): Promise<{ id: string; name: string; path: string } | null>;
  findById(id: string): Promise<{ id: string; parentId: string | null; path: string; level: number } | null>;
  create(data: CreateCategoryData): Promise<CategoryNode>;
  slugExists(slug: string): Promise<boolean>;
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface ICategoryExistenceCheck {
  exists(id: string): Promise<boolean>;
}

export interface IBrandRepository {
  listActive(): Promise<BrandSummary[]>;
  exists(id: string): Promise<boolean>;
}

/**
 * A product belongs to a seller, but the caller authenticates as a user. This
 * one-method port resolves the seller identity behind the signed-in user — kept
 * separate so the catalog never reaches into the seller module's internals.
 */
export interface ISellerLookup {
  /** The seller id for a user, or null if they have no (approved) seller profile. */
  findApprovedSellerId(userId: string): Promise<string | null>;
}
