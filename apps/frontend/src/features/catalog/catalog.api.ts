import { apiGet, apiGetPaginated } from '@/lib/api-client';
import type {
  Brand,
  CategoryNode,
  Paginated,
  ProductDetail,
  ProductListItem,
  ProductQuery,
} from '@/types/api';

/** Catalog is public — none of these needs a token, so all are safe to render on the server. */
export const catalogApi = {
  listProducts: (query: ProductQuery = {}): Promise<Paginated<ProductListItem>> =>
    apiGetPaginated<ProductListItem>('/catalog/products', {
      params: {
        category: query.category,
        brands: query.brands,
        q: query.q,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        sort: query.sort,
        cursor: query.cursor,
        limit: query.limit,
      },
    }),

  getProduct: (slug: string): Promise<ProductDetail> =>
    apiGet<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}`),

  getCategories: (): Promise<CategoryNode[]> => apiGet<CategoryNode[]>('/catalog/categories'),

  getBrands: (): Promise<Brand[]> => apiGet<Brand[]>('/catalog/brands'),
};

export const catalogKeys = {
  all: ['catalog'] as const,
  products: (query: ProductQuery) => [...catalogKeys.all, 'products', query] as const,
  product: (slug: string) => [...catalogKeys.all, 'product', slug] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  brands: () => [...catalogKeys.all, 'brands'] as const,
};
