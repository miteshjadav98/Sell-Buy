import { Inject, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { ForbiddenError } from '../../../../common/errors/domain.errors';
import { PaginatedResult } from '../../../../core/application/pagination';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  IProductReadRepository,
  ISellerLookup,
  ProductListItem,
  PRODUCT_READ_REPOSITORY,
  SELLER_LOOKUP,
} from '../../domain/ports/catalog.ports';

export interface ListSellerProductsInput {
  userId: string;
  status?: ProductStatus;
  page: number;
  limit: number;
}

/**
 * A seller's own catalogue for their dashboard — every status, not just live,
 * and offset-paginated because a dashboard wants page numbers, not infinite
 * scroll. Scoped to the caller's own seller id so one seller can never page
 * through another's drafts.
 */
@Injectable()
export class ListSellerProductsUseCase
  implements IUseCase<ListSellerProductsInput, PaginatedResult<ProductListItem>>
{
  constructor(
    @Inject(SELLER_LOOKUP) private readonly sellers: ISellerLookup,
    @Inject(PRODUCT_READ_REPOSITORY) private readonly products: IProductReadRepository,
  ) {}

  async execute(input: ListSellerProductsInput): Promise<PaginatedResult<ProductListItem>> {
    const sellerId = await this.sellers.findApprovedSellerId(input.userId);
    if (!sellerId) throw new ForbiddenError('Only an approved seller has a catalogue.');

    return this.products.listForSeller(sellerId, {
      status: input.status,
      page: input.page,
      limit: input.limit,
    });
  }
}
