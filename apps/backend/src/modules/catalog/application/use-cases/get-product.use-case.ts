import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import {
  IProductReadRepository,
  ProductDetail,
  PRODUCT_READ_REPOSITORY,
} from '../../domain/ports/catalog.ports';

/**
 * The public product detail page, addressed by slug (the SEO-friendly, stable
 * URL) rather than a uuid. Only live products resolve — a draft or a deactivated
 * listing is a 404 to the public, indistinguishable from one that never existed.
 */
@Injectable()
export class GetProductUseCase implements IUseCase<string, ProductDetail> {
  constructor(
    @Inject(PRODUCT_READ_REPOSITORY) private readonly products: IProductReadRepository,
  ) {}

  async execute(slug: string): Promise<ProductDetail> {
    const product = await this.products.findDetailBySlug(slug);
    if (!product) {
      throw new NotFoundError('Product', slug);
    }
    return product;
  }
}
