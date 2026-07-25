import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  IProductWriteRepository,
  PRODUCT_WRITE_REPOSITORY,
} from '../../domain/ports/catalog.ports';
import { ReviewProductDto } from '../dto/catalog.dto';

export interface ReviewProductInput {
  adminId: string;
  productId: string;
  dto: ReviewProductDto;
}

/**
 * An admin approves or rejects a product awaiting review. Approval is the only
 * path to ACTIVE — a seller cannot self-publish, which is the whole point of the
 * marketplace acting as gatekeeper.
 *
 * A rejection without a reason is refused: the seller has to be told what to
 * fix, or the review loop never converges.
 */
@Injectable()
export class ReviewProductUseCase implements IUseCase<ReviewProductInput, { status: string }> {
  private readonly logger = new Logger(ReviewProductUseCase.name);

  constructor(
    @Inject(PRODUCT_WRITE_REPOSITORY) private readonly products: IProductWriteRepository,
  ) {}

  async execute({ adminId, productId, dto }: ReviewProductInput): Promise<{ status: string }> {
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError('Product', productId);

    if (dto.decision === 'REJECT' && !dto.reason?.trim()) {
      throw new ValidationError('A rejection must include a reason for the seller.');
    }

    const result = dto.decision === 'APPROVE' ? product.approve() : product.reject();
    if (result.isFailure) throw new BusinessRuleError(result.error);

    await this.products.updateStatus(product.id, product.status, product.publishedAt);
    this.logger.log(
      `Admin ${adminId} ${dto.decision === 'APPROVE' ? 'approved' : 'rejected'} product ${product.id}`,
    );

    // A published product is where a "ProductPublished" domain event would be
    // emitted — for search indexing, seller notification, cache warming — once
    // the event bus lands. Kept as a single status write until then.
    return { status: product.status };
  }
}
