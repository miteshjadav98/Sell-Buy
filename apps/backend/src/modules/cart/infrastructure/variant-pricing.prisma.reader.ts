import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IVariantPricingReader, VariantPricing } from '../domain/ports/cart.ports';

const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

/**
 * The cart's read-only window onto catalogue pricing. A one-purpose adapter over
 * the same tables the catalog owns — kept here so the cart depends on an
 * interface it defined, not on the catalog module, and so "is this buyable and
 * what does it cost right now?" is answered live at add-time.
 */
@Injectable()
export class VariantPricingPrismaReader implements IVariantPricingReader {
  constructor(private readonly prisma: PrismaService) {}

  async find(variantId: string): Promise<VariantPricing | null> {
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        name: true,
        price: true,
        compareAtPrice: true,
        isActive: true,
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            deletedAt: true,
            media: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
    });

    if (!v) return null;

    return {
      variantId: v.id,
      productId: v.product.id,
      productSlug: v.product.slug,
      title: v.product.title,
      variantName: v.name,
      imageUrl: v.product.media[0]?.url ?? null,
      unitPrice: num(v.price),
      compareAtPrice: v.compareAtPrice != null ? num(v.compareAtPrice) : null,
      purchasable:
        v.isActive && v.product.status === ProductStatus.ACTIVE && v.product.deletedAt === null,
    };
  }
}
