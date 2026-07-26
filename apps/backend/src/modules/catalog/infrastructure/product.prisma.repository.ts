import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { buildCursorResult, buildOffsetResult, PaginatedResult } from '../../../core/application/pagination';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Product, ProductVariantSnapshot } from '../domain/entities/product.entity';
import {
  CreateProductData,
  IProductReadRepository,
  IProductWriteRepository,
  ProductDetail,
  ProductListItem,
  ProductQuery,
} from '../domain/ports/catalog.ports';

/** Turns a Prisma Decimal (or null) into a plain number for the API/domain. */
const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

/**
 * The only place in the catalog feature that knows Prisma exists.
 *
 * It carries both the read and write contracts, but they are exposed to the
 * application through two segregated tokens (see the module), so a storefront
 * use case is handed an interface with no `create` on it at all. The class is
 * one instance either way — one connection pool, one place to change when the
 * schema moves.
 */
@Injectable()
export class ProductPrismaRepository implements IProductReadRepository, IProductWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Write side
  // =========================================================================

  /**
   * Creates the product, its options, variants and the variant↔option-value
   * links in a single transaction. It has to be one unit: a product whose
   * variants half-saved is a catalogue corruption a buyer would hit at checkout.
   *
   * The link table (VariantOptionValue) references ids generated *within* this
   * transaction, which is exactly why a flat nested `create` can't express it —
   * we create options first, capture their value ids, then wire variants to them.
   */
  async create(data: CreateProductData): Promise<Product> {
    const row = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sellerId: data.sellerId,
          categoryId: data.categoryId,
          brandId: data.brandId ?? null,
          title: data.title,
          slug: data.slug,
          description: data.description,
          highlights: data.highlights,
          status: ProductStatus.DRAFT,
          ...(data.taxRate != null ? { taxRate: new Prisma.Decimal(data.taxRate) } : {}),
          options: {
            create: data.options.map((o, oi) => ({
              name: o.name,
              position: oi,
              values: {
                create: o.values.map((v, vi) => ({
                  value: v.value,
                  hexCode: v.hexCode ?? null,
                  position: vi,
                })),
              },
            })),
          },
          media: {
            create: data.media.map((m, i) => ({
              url: m.url,
              thumbnailUrl: m.thumbnailUrl ?? null,
              altText: m.altText ?? null,
              type: m.type ?? 'IMAGE',
              position: i,
            })),
          },
          specifications: {
            create: data.specifications.map((s, i) => ({
              group: s.group,
              key: s.key,
              value: s.value,
              position: i,
            })),
          },
        },
        include: { options: { include: { values: true } } },
      });

      // Index the freshly-created option values by "OptionName::value" so each
      // variant's answers resolve to concrete ids.
      const valueId = new Map<string, string>();
      for (const option of product.options) {
        for (const value of option.values) {
          valueId.set(`${option.name}::${value.value}`, value.id);
        }
      }

      for (const [i, variant] of data.variants.entries()) {
        const created = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variant.sku,
            name: variant.name,
            price: new Prisma.Decimal(variant.price),
            compareAtPrice: variant.compareAtPrice != null ? new Prisma.Decimal(variant.compareAtPrice) : null,
            costPrice: variant.costPrice != null ? new Prisma.Decimal(variant.costPrice) : null,
            weightGrams: variant.weightGrams ?? null,
            isDefault: variant.isDefault ?? false,
            position: i,
          },
        });

        const links = Object.entries(variant.optionValues)
          .map(([name, value]) => valueId.get(`${name}::${value}`))
          .filter((id): id is string => Boolean(id))
          .map((optionValueId) => ({ variantId: created.id, optionValueId }));

        if (links.length > 0) {
          await tx.variantOptionValue.createMany({ data: links });
        }
      }

      await this.refreshPriceRange(tx, product.id);

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: { select: { id: true, price: true, isActive: true } } },
      });
    });

    return this.toDomain(row);
  }

  /**
   * Recomputes `products.minPrice` from the product's active variants.
   *
   * Every write that changes a variant's price or `isActive` must call this in
   * the same transaction as the write itself. A stale minPrice is not a cosmetic
   * problem: it is the sort key for the listing, so a product drifts to the wrong
   * position in a price-sorted grid and nothing anywhere throws.
   *
   * Deliberately takes the transaction client rather than reaching for
   * `this.prisma`, so it cannot silently commit outside the caller's transaction.
   */
  private async refreshPriceRange(tx: Prisma.TransactionClient, productId: string): Promise<void> {
    const { _min } = await tx.productVariant.aggregate({
      where: { productId, isActive: true },
      _min: { price: true },
    });

    await tx.product.update({
      where: { id: productId },
      // Null when no variant is active — such a product cannot be bought, and
      // `nulls: 'last'` keeps it out of the way of ones that can.
      data: { minPrice: _min.price ?? null },
    });
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { variants: { select: { id: true, price: true, isActive: true } } },
    });
    return row ? this.toDomain(row) : null;
  }

  async updateStatus(id: string, status: ProductStatus, publishedAt: Date | null): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { status, publishedAt },
    });
  }

  async slugExists(slug: string): Promise<boolean> {
    const found = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  }

  // =========================================================================
  // Read side
  // =========================================================================

  /**
   * Storefront listing. Cursor pagination is on `id` as a tiebreaker appended to
   * every sort, so a stable page boundary exists even when sorting by a
   * non-unique column like price or rating — fetch limit+1, and the extra row is
   * how we know there's a next page without a second COUNT.
   */
  async list(query: ProductQuery): Promise<PaginatedResult<ProductListItem>> {
    const where = await this.buildStorefrontWhere(query);

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: this.buildOrderBy(query.sort),
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.listItemInclude(),
    });

    const items = rows.map((r) => this.toListItem(r));
    return buildCursorResult(items, query.limit);
  }

  async listForSeller(
    sellerId: string,
    params: { status?: ProductStatus; page: number; limit: number },
  ): Promise<PaginatedResult<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {
      sellerId,
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: this.listItemInclude(),
      }),
      this.prisma.product.count({ where }),
    ]);

    return buildOffsetResult(rows.map((r) => this.toListItem(r)), total, params);
  }

  async findDetailBySlug(slug: string): Promise<ProductDetail | null> {
    const p = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE, deletedAt: null },
      include: {
        brand: { select: { name: true, slug: true } },
        category: { select: { name: true, slug: true } },
        seller: { select: { businessName: true, slug: true, rating: true } },
        options: {
          orderBy: { position: 'asc' },
          include: { values: { orderBy: { position: 'asc' } } },
        },
        media: { orderBy: { position: 'asc' } },
        specifications: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { position: 'asc' },
          include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
        },
      },
    });

    if (!p) return null;

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      highlights: p.highlights,
      status: p.status,
      brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
      category: { name: p.category.name, slug: p.category.slug },
      seller: { businessName: p.seller.businessName, slug: p.seller.slug, rating: num(p.seller.rating) },
      ratingAverage: num(p.ratingAverage),
      ratingCount: p.ratingCount,
      totalSold: p.totalSold,
      taxRate: num(p.taxRate),
      options: p.options.map((o) => ({
        name: o.name,
        values: o.values.map((v) => ({ value: v.value, hexCode: v.hexCode })),
      })),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        price: num(v.price),
        compareAtPrice: v.compareAtPrice != null ? num(v.compareAtPrice) : null,
        isDefault: v.isDefault,
        options: Object.fromEntries(
          v.optionValues.map((ov) => [ov.optionValue.option.name, ov.optionValue.value]),
        ),
      })),
      media: p.media.map((m) => ({
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        altText: m.altText,
        type: m.type,
      })),
      specifications: p.specifications.map((s) => ({ group: s.group, key: s.key, value: s.value })),
    };
  }

  // =========================================================================
  // Query composition (kept private — this is the Builder for catalogue reads)
  // =========================================================================

  private async buildStorefrontWhere(query: ProductQuery): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
    };

    if (query.categorySlug) {
      // Match the category and everything beneath it, via the materialised path.
      const category = await this.prisma.category.findUnique({
        where: { slug: query.categorySlug },
        select: { path: true },
      });
      if (!category) {
        // A filter on a category that does not exist yields nothing, not everything.
        where.id = '00000000-0000-0000-0000-000000000000';
        return where;
      }
      where.category = { path: { startsWith: category.path } };
    }

    if (query.brandSlugs?.length) {
      where.brand = { slug: { in: query.brandSlugs } };
    }

    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    // Price filters and the "must have a live variant" rule both key off an
    // active variant, so they compose into one `some` clause.
    const priceFilter: Prisma.DecimalFilter = {};
    if (query.minPrice != null) priceFilter.gte = new Prisma.Decimal(query.minPrice);
    if (query.maxPrice != null) priceFilter.lte = new Prisma.Decimal(query.maxPrice);
    where.variants = {
      some: {
        isActive: true,
        ...(query.minPrice != null || query.maxPrice != null ? { price: priceFilter } : {}),
      },
    };

    return where;
  }

  private buildOrderBy(sort: ProductQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    // `id` is always the final tiebreaker so the cursor has a stable boundary.
    switch (sort) {
      // Both directions key off `minPrice` — the same "from ₹x" the card shows,
      // so the ordering matches the number the shopper is reading. Products with
      // no active variant sort last either way rather than heading the "low to
      // high" page with an empty price.
      case 'price_asc':
        return [{ minPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
      case 'price_desc':
        return [{ minPrice: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
      case 'rating':
        return [{ ratingAverage: 'desc' }, { id: 'asc' }];
      case 'popular':
        return [{ totalSold: 'desc' }, { id: 'asc' }];
      case 'newest':
      default:
        return [{ publishedAt: 'desc' }, { id: 'asc' }];
    }
  }

  private listItemInclude() {
    return {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      media: { orderBy: { position: 'asc' as const }, take: 1 },
      variants: {
        where: { isActive: true },
        select: { price: true, compareAtPrice: true },
      },
    };
  }

  private toListItem(r: {
    id: string;
    slug: string;
    title: string;
    isFeatured: boolean;
    ratingAverage: Prisma.Decimal;
    ratingCount: number;
    brand: { name: string } | null;
    category: { name: string };
    media: Array<{ url: string }>;
    variants: Array<{ price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null }>;
  }): ProductListItem {
    const prices = r.variants.map((v) => num(v.price));
    const comparePrices = r.variants
      .map((v) => (v.compareAtPrice != null ? num(v.compareAtPrice) : null))
      .filter((p): p is number => p != null);

    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      brandName: r.brand?.name ?? null,
      categoryName: r.category.name,
      ratingAverage: num(r.ratingAverage),
      ratingCount: r.ratingCount,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      compareAtPrice: comparePrices.length ? Math.max(...comparePrices) : null,
      primaryImageUrl: r.media[0]?.url ?? null,
      isFeatured: r.isFeatured,
    };
  }

  private toDomain(row: {
    id: string;
    sellerId: string;
    categoryId: string;
    brandId: string | null;
    title: string;
    slug: string;
    description: string;
    status: ProductStatus;
    publishedAt: Date | null;
    variants: Array<{ id: string; price: Prisma.Decimal; isActive: boolean }>;
  }): Product {
    const variants: ProductVariantSnapshot[] = row.variants.map((v) => ({
      id: v.id,
      price: num(v.price),
      isActive: v.isActive,
    }));

    return Product.hydrate(row.id, {
      sellerId: row.sellerId,
      categoryId: row.categoryId,
      brandId: row.brandId,
      title: row.title,
      slug: row.slug,
      description: row.description,
      status: row.status,
      publishedAt: row.publishedAt,
      variants,
    });
  }
}
