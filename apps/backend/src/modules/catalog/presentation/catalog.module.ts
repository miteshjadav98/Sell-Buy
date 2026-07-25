import { Module } from '@nestjs/common';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_READ_REPOSITORY,
  PRODUCT_WRITE_REPOSITORY,
  SELLER_LOOKUP,
} from '../domain/ports/catalog.ports';
import { CreateCategoryUseCase } from '../application/use-cases/create-category.use-case';
import { CreateProductUseCase } from '../application/use-cases/create-product.use-case';
import { GetCategoryTreeUseCase } from '../application/use-cases/get-category-tree.use-case';
import { GetProductUseCase } from '../application/use-cases/get-product.use-case';
import { ListBrandsUseCase } from '../application/use-cases/list-brands.use-case';
import { ListProductsUseCase } from '../application/use-cases/list-products.use-case';
import { ListSellerProductsUseCase } from '../application/use-cases/list-seller-products.use-case';
import { ReviewProductUseCase } from '../application/use-cases/review-product.use-case';
import { SubmitProductUseCase } from '../application/use-cases/submit-product.use-case';
import { BrandPrismaRepository } from '../infrastructure/brand.prisma.repository';
import { CategoryPrismaRepository } from '../infrastructure/category.prisma.repository';
import { ProductPrismaRepository } from '../infrastructure/product.prisma.repository';
import { SellerLookupPrismaRepository } from '../infrastructure/seller-lookup.prisma.repository';
import { AdminCatalogController } from './admin-catalog.controller';
import { CatalogController } from './catalog.controller';
import { SellerProductController } from './seller-product.controller';

/**
 * The composition root for the catalog — where the interfaces the use cases own
 * are bound to their Prisma implementations.
 *
 * ProductPrismaRepository is one class exposed through two segregated tokens via
 * useExisting: the storefront gets PRODUCT_READ_REPOSITORY (no write methods in
 * sight), the seller/admin flows get PRODUCT_WRITE_REPOSITORY — one instance,
 * one connection pool, two contracts. PrismaService and RedisService come from
 * the @Global infrastructure modules, so they need no import here.
 */
@Module({
  controllers: [CatalogController, SellerProductController, AdminCatalogController],
  providers: [
    // --- Use cases ---
    ListProductsUseCase,
    GetProductUseCase,
    GetCategoryTreeUseCase,
    ListBrandsUseCase,
    CreateProductUseCase,
    SubmitProductUseCase,
    ListSellerProductsUseCase,
    ReviewProductUseCase,
    CreateCategoryUseCase,

    // --- Port bindings (Dependency Inversion) ---
    ProductPrismaRepository,
    { provide: PRODUCT_READ_REPOSITORY, useExisting: ProductPrismaRepository },
    { provide: PRODUCT_WRITE_REPOSITORY, useExisting: ProductPrismaRepository },
    { provide: CATEGORY_REPOSITORY, useClass: CategoryPrismaRepository },
    { provide: BRAND_REPOSITORY, useClass: BrandPrismaRepository },
    { provide: SELLER_LOOKUP, useClass: SellerLookupPrismaRepository },
  ],
})
export class CatalogModule {}
