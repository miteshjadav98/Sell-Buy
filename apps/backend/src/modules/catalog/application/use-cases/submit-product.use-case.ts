import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  IProductWriteRepository,
  ISellerLookup,
  PRODUCT_WRITE_REPOSITORY,
  SELLER_LOOKUP,
} from '../../domain/ports/catalog.ports';

export interface SubmitProductInput {
  userId: string;
  productId: string;
}

/**
 * A seller submits a draft (or a previously rejected product) for review.
 *
 * The use case does two things the entity cannot: it proves the caller owns the
 * product, and it persists the resulting status. The decision of *whether* the
 * transition is legal — right status, has a priced variant, has a description —
 * belongs to the entity, so it holds no matter what triggers the submit.
 */
@Injectable()
export class SubmitProductUseCase implements IUseCase<SubmitProductInput, { status: string }> {
  private readonly logger = new Logger(SubmitProductUseCase.name);

  constructor(
    @Inject(SELLER_LOOKUP) private readonly sellers: ISellerLookup,
    @Inject(PRODUCT_WRITE_REPOSITORY) private readonly products: IProductWriteRepository,
  ) {}

  async execute({ userId, productId }: SubmitProductInput): Promise<{ status: string }> {
    const sellerId = await this.sellers.findApprovedSellerId(userId);
    if (!sellerId) throw new ForbiddenError('Only an approved seller can submit products.');

    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError('Product', productId);

    // Ownership is checked here, not in a WHERE clause, so the caller gets a
    // clear 403 rather than an ambiguous 404 for someone else's product.
    if (!product.isOwnedBy(sellerId)) {
      throw new ForbiddenError('You can only submit your own products.');
    }

    const result = product.submitForReview();
    if (result.isFailure) throw new BusinessRuleError(result.error);

    await this.products.updateStatus(product.id, product.status, product.publishedAt);
    this.logger.log(`Product ${product.id} submitted for review by seller ${sellerId}`);

    return { status: product.status };
  }
}
