import { Injectable } from '@nestjs/common';
import { CartStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { toMinor } from '../domain/pricing/order-totals';
import {
  CheckoutCart,
  CheckoutLine,
  ICheckoutCartReader,
  TxContext,
} from '../domain/ports/checkout.ports';

/**
 * Reads the cart the way checkout needs it — joined to the live catalogue.
 *
 * This is a different read from the one the cart page does, which is why it is a
 * different adapter rather than a shared one. Checkout needs the seller, the tax
 * rate, the weight and the category on every line, and it needs them from the
 * product tables rather than from the cart row: `priceSnapshot` is what the
 * shopper last saw, and pricing an order from it would let a stale tab dictate
 * what things cost.
 */
@Injectable()
export class CheckoutCartPrismaReader implements ICheckoutCartReader {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async loadForUser(userId: string, tx?: TxContext): Promise<CheckoutCart | null> {
    const client = this.client(tx);

    const cart = await client.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        couponCode: true,
        giftWrap: true,
        items: {
          // Saved-for-later is a wishlist by another name. Buying it because it
          // happened to live in the same table would be indefensible.
          where: { savedForLater: false },
          orderBy: { addedAt: 'asc' },
          select: {
            id: true,
            variantId: true,
            quantity: true,
            priceSnapshot: true,
            variant: {
              select: {
                name: true,
                sku: true,
                price: true,
                weightGrams: true,
                isActive: true,
                product: {
                  select: {
                    id: true,
                    sellerId: true,
                    categoryId: true,
                    title: true,
                    status: true,
                    taxRate: true,
                    deletedAt: true,
                    media: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cart) return null;

    const lines: CheckoutLine[] = cart.items.map((item) => ({
      cartItemId: item.id,
      variantId: item.variantId,
      productId: item.variant.product.id,
      sellerId: item.variant.product.sellerId,
      categoryId: item.variant.product.categoryId,
      productTitle: item.variant.product.title,
      variantName: item.variant.name,
      sku: item.variant.sku,
      imageUrl: item.variant.product.media[0]?.url ?? null,
      unitPriceMinor: toMinor(item.variant.price.toString()),
      priceSnapshotMinor: toMinor(item.priceSnapshot.toString()),
      taxRatePercent: Number(item.variant.product.taxRate),
      // A variant with no recorded weight is treated as weightless rather than
      // blocking the order; shipping bands then price it at the base rate.
      weightGrams: item.variant.weightGrams ?? 0,
      quantity: item.quantity,
      purchasable:
        item.variant.isActive &&
        item.variant.product.status === ProductStatus.ACTIVE &&
        item.variant.product.deletedAt === null,
    }));

    return {
      cartId: cart.id,
      couponCode: cart.couponCode,
      giftWrap: cart.giftWrap,
      lines,
    };
  }

  async markConverted(tx: TxContext, cartId: string): Promise<void> {
    await this.client(tx).cart.update({
      where: { id: cartId },
      data: { status: CartStatus.CONVERTED },
    });
  }
}
