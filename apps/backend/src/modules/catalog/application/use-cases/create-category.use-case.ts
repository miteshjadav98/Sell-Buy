import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  CATEGORY_REPOSITORY,
  CategoryNode,
  ICategoryRepository,
} from '../../domain/ports/catalog.ports';
import { CreateCategoryDto } from '../dto/catalog.dto';
import { uniqueSlug } from '../slug';

/**
 * Admin creates a category, optionally under a parent. The materialised `path`
 * and `level` that make the tree cheap to query are derived by the repository
 * from the parent — the caller only supplies the parent id.
 */
@Injectable()
export class CreateCategoryUseCase implements IUseCase<CreateCategoryDto, CategoryNode> {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: ICategoryRepository,
  ) {}

  async execute(dto: CreateCategoryDto): Promise<CategoryNode> {
    if (dto.parentId && !(await this.categories.findById(dto.parentId))) {
      throw new NotFoundError('Parent category', dto.parentId);
    }

    const slug = await uniqueSlug(dto.name, (candidate) => this.categories.slugExists(candidate));

    return this.categories.create({
      name: dto.name.trim(),
      slug,
      parentId: dto.parentId,
      description: dto.description,
      imageUrl: dto.imageUrl,
      iconUrl: dto.iconUrl,
    });
  }
}
