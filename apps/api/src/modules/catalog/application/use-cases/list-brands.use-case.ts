import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { BRAND_REPOSITORY, BrandSummary, IBrandRepository } from '../../domain/ports/catalog.ports';

/** The active brand list — powers the brand filter facet. */
@Injectable()
export class ListBrandsUseCase implements IUseCase<void, BrandSummary[]> {
  constructor(@Inject(BRAND_REPOSITORY) private readonly brands: IBrandRepository) {}

  execute(): Promise<BrandSummary[]> {
    return this.brands.listActive();
  }
}
