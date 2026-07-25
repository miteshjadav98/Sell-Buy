import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  CATEGORY_REPOSITORY,
  CategoryNode,
  ICategoryRepository,
} from '../../domain/ports/catalog.ports';

/**
 * The full active category tree — the navigation menu and the filter sidebar
 * both render from this. It changes rarely and is read constantly, so the
 * repository caches it; this use case stays oblivious to that.
 */
@Injectable()
export class GetCategoryTreeUseCase implements IUseCase<void, CategoryNode[]> {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: ICategoryRepository,
  ) {}

  execute(): Promise<CategoryNode[]> {
    return this.categories.getTree();
  }
}
