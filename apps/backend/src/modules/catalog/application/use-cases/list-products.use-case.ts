import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { PaginatedResult } from '../../../../core/application/pagination';
import {
  IProductReadRepository,
  ProductListItem,
  ProductQuery,
  PRODUCT_READ_REPOSITORY,
} from '../../domain/ports/catalog.ports';
import { ProductQueryDto } from '../dto/catalog.dto';

/**
 * The storefront listing. Thin by design: it translates the HTTP-shaped query
 * DTO into the domain ProductQuery and hands off. All the query composition —
 * filters, sort, cursor — lives in the repository, because *how* to ask Postgres
 * efficiently is a persistence concern, not an application one.
 */
@Injectable()
export class ListProductsUseCase implements IUseCase<ProductQueryDto, PaginatedResult<ProductListItem>> {
  constructor(
    @Inject(PRODUCT_READ_REPOSITORY) private readonly products: IProductReadRepository,
  ) {}

  async execute(dto: ProductQueryDto): Promise<PaginatedResult<ProductListItem>> {
    const query: ProductQuery = {
      categorySlug: dto.category,
      brandSlugs: dto.brands
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      search: dto.q?.trim() || undefined,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      sort: dto.sort,
      cursor: dto.cursor,
      limit: dto.limit,
    };

    return this.products.list(query);
  }
}
