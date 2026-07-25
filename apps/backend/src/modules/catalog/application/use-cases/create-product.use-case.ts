import { Inject, Injectable, Logger } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  CreateProductData,
  IBrandRepository,
  ICategoryRepository,
  IProductWriteRepository,
  ISellerLookup,
  PRODUCT_WRITE_REPOSITORY,
  SELLER_LOOKUP,
} from '../../domain/ports/catalog.ports';
import { CreateProductDto } from '../dto/catalog.dto';
import { uniqueSlug } from '../slug';

export interface CreateProductInput {
  userId: string;
  dto: CreateProductDto;
}

export interface CreateProductResult {
  id: string;
  slug: string;
  status: string;
}

/**
 * A seller creates a product. It lands in DRAFT — creation and going live are
 * two different decisions, and the second one (submitForReview) has its own
 * rules and its own audit point.
 *
 * This use case owns the *cross-entity* validation that no single entity can do
 * alone: the seller exists and is approved, the category and brand are real, and
 * every declared variant actually answers the product's options. Referential
 * checks belong here; the Product entity then owns the lifecycle rules.
 */
@Injectable()
export class CreateProductUseCase implements IUseCase<CreateProductInput, CreateProductResult> {
  private readonly logger = new Logger(CreateProductUseCase.name);

  constructor(
    @Inject(SELLER_LOOKUP) private readonly sellers: ISellerLookup,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: ICategoryRepository,
    @Inject(BRAND_REPOSITORY) private readonly brands: IBrandRepository,
    @Inject(PRODUCT_WRITE_REPOSITORY) private readonly products: IProductWriteRepository,
  ) {}

  async execute({ userId, dto }: CreateProductInput): Promise<CreateProductResult> {
    const sellerId = await this.sellers.findApprovedSellerId(userId);
    if (!sellerId) {
      throw new ForbiddenError('Only an approved seller can create products.');
    }

    const category = await this.categories.findById(dto.categoryId);
    if (!category) throw new NotFoundError('Category', dto.categoryId);

    if (dto.brandId && !(await this.brands.exists(dto.brandId))) {
      throw new NotFoundError('Brand', dto.brandId);
    }

    this.assertVariantsAreConsistent(dto);

    const slug = await uniqueSlug(dto.title, (candidate) => this.products.slugExists(candidate));

    const data: CreateProductData = {
      sellerId,
      categoryId: dto.categoryId,
      brandId: dto.brandId,
      title: dto.title.trim(),
      slug,
      description: dto.description.trim(),
      highlights: dto.highlights ?? [],
      taxRate: dto.taxRate,
      options: (dto.options ?? []).map((o) => ({
        name: o.name.trim(),
        values: o.values.map((v) => ({ value: v.value.trim(), hexCode: v.hexCode })),
      })),
      variants: dto.variants.map((v) => ({
        sku: v.sku.trim(),
        name: v.name.trim(),
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        costPrice: v.costPrice,
        weightGrams: v.weightGrams,
        isDefault: v.isDefault,
        optionValues: v.optionValues,
      })),
      media: (dto.media ?? []).map((m) => ({
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        altText: m.altText,
        type: m.type,
      })),
      specifications: dto.specifications ?? [],
    };

    const product = await this.products.create(data);
    this.logger.log(`Seller ${sellerId} created product ${product.id} (${slug})`);

    return { id: product.id, slug: product.slug, status: product.status };
  }

  /**
   * The heart of variant validation. A variant is a combination of one value per
   * option, so three rules must hold, and holding them here means the repository
   * never has to reason about a malformed catalogue:
   *   1. Every variant answers exactly the declared options — no missing option,
   *      no stray one.
   *   2. Each answer is one of that option's declared values.
   *   3. No two variants share the same combination, and none share a SKU.
   */
  private assertVariantsAreConsistent(dto: CreateProductDto): void {
    const options = dto.options ?? [];
    const optionNames = options.map((o) => o.name.trim());

    if (new Set(optionNames).size !== optionNames.length) {
      throw new ValidationError('Two options share the same name.');
    }

    const allowedValues = new Map(
      options.map((o) => [o.name.trim(), new Set(o.values.map((v) => v.value.trim()))]),
    );

    const seenSkus = new Set<string>();
    const seenCombinations = new Set<string>();
    let defaults = 0;

    for (const variant of dto.variants) {
      const sku = variant.sku.trim();
      if (seenSkus.has(sku)) throw new ValidationError(`Duplicate SKU "${sku}".`);
      seenSkus.add(sku);

      if (variant.compareAtPrice != null && variant.compareAtPrice <= variant.price) {
        throw new ValidationError(`compareAtPrice must be higher than price for SKU "${sku}".`);
      }
      if (variant.isDefault) defaults++;

      const answered = Object.keys(variant.optionValues).map((k) => k.trim());
      if (answered.length !== optionNames.length || !optionNames.every((n) => answered.includes(n))) {
        throw new ValidationError(
          `Variant "${sku}" must set exactly the product's options: ${optionNames.join(', ') || '(none)'}.`,
        );
      }
      for (const [name, value] of Object.entries(variant.optionValues)) {
        if (!allowedValues.get(name.trim())?.has(value.trim())) {
          throw new ValidationError(`"${value}" is not a declared value of option "${name}".`);
        }
      }

      const signature = optionNames.map((n) => variant.optionValues[n].trim()).join(' / ');
      if (seenCombinations.has(signature)) {
        throw new ValidationError(`Two variants share the same option combination (${signature}).`);
      }
      seenCombinations.add(signature);
    }

    if (defaults > 1) {
      throw new ValidationError('Only one variant may be marked as the default.');
    }
  }
}
