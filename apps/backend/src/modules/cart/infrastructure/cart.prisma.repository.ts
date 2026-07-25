import { Injectable } from '@nestjs/common';
import { CartStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CartIdentity, CartLineRaw, ICartRepository } from '../domain/ports/cart.ports';

const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

/**
 * The cart's persistence. The only place the cart feature touches Prisma.
 *
 * Guest carts are keyed by a unique sessionId, user carts by userId; both are
 * ACTIVE until checkout converts them. The `(cartId, variantId)` uniqueness in
 * the schema is what lets "add to cart" be an upsert instead of a read-modify-
 * write race between two tabs.
 */
@Injectable()
export class CartPrismaRepository implements ICartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateActiveCartId(identity: CartIdentity): Promise<string> {
    const existing = await this.findActiveCartId(identity);
    if (existing) return existing;

    const created = await this.prisma.cart.create({
      data: {
        userId: identity.userId ?? null,
        sessionId: identity.userId ? null : identity.sessionId ?? null,
        status: CartStatus.ACTIVE,
      },
      select: { id: true },
    });
    return created.id;
  }

  async findActiveCartId(identity: CartIdentity): Promise<string | null> {
    const where: Prisma.CartWhereInput = identity.userId
      ? { userId: identity.userId }
      : { sessionId: identity.sessionId };

    const cart = await this.prisma.cart.findFirst({
      where: { ...where, status: CartStatus.ACTIVE },
      // Newest active cart wins if a stale one somehow lingers.
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return cart?.id ?? null;
  }

  async getLines(cartId: string): Promise<CartLineRaw[]> {
    const rows = await this.prisma.cartItem.findMany({
      where: { cartId },
      orderBy: { addedAt: 'asc' },
      include: {
        variant: {
          select: {
            price: true,
            compareAtPrice: true,
            name: true,
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
        },
      },
    });

    return rows.map((r) => ({
      itemId: r.id,
      variantId: r.variantId,
      productId: r.variant.product.id,
      productSlug: r.variant.product.slug,
      title: r.variant.product.title,
      variantName: r.variant.name,
      imageUrl: r.variant.product.media[0]?.url ?? null,
      unitPrice: num(r.variant.price),
      compareAtPrice: r.variant.compareAtPrice != null ? num(r.variant.compareAtPrice) : null,
      priceSnapshot: num(r.priceSnapshot),
      quantity: r.quantity,
      savedForLater: r.savedForLater,
      purchasable:
        r.variant.isActive &&
        r.variant.product.status === ProductStatus.ACTIVE &&
        r.variant.product.deletedAt === null,
    }));
  }

  async findItem(
    cartId: string,
    itemId: string,
  ): Promise<{ variantId: string; quantity: number } | null> {
    return this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      select: { variantId: true, quantity: true },
    });
  }

  async findItemByVariant(
    cartId: string,
    variantId: string,
  ): Promise<{ itemId: string; quantity: number } | null> {
    const row = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { id: true, quantity: true },
    });
    return row ? { itemId: row.id, quantity: row.quantity } : null;
  }

  async upsertItem(
    cartId: string,
    variantId: string,
    quantity: number,
    priceSnapshot: number,
  ): Promise<void> {
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      // Adding an item that was saved-for-later brings it back to the active cart.
      update: { quantity, priceSnapshot: new Prisma.Decimal(priceSnapshot), savedForLater: false },
      create: {
        cartId,
        variantId,
        quantity,
        priceSnapshot: new Prisma.Decimal(priceSnapshot),
      },
    });
    await this.touch(cartId);
  }

  async setItemQuantity(cartId: string, itemId: string, quantity: number): Promise<boolean> {
    const result = await this.prisma.cartItem.updateMany({
      where: { id: itemId, cartId },
      data: { quantity },
    });
    if (result.count > 0) await this.touch(cartId);
    return result.count > 0;
  }

  async removeItem(cartId: string, itemId: string): Promise<boolean> {
    const result = await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
    if (result.count > 0) await this.touch(cartId);
    return result.count > 0;
  }

  async setSavedForLater(cartId: string, itemId: string, saved: boolean): Promise<boolean> {
    const result = await this.prisma.cartItem.updateMany({
      where: { id: itemId, cartId },
      data: { savedForLater: saved },
    });
    if (result.count > 0) await this.touch(cartId);
    return result.count > 0;
  }

  async clearActiveItems(cartId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId, savedForLater: false } });
    await this.touch(cartId);
  }

  async deleteCart(cartId: string): Promise<void> {
    // Items cascade on the FK, so one delete is enough.
    await this.prisma.cart.delete({ where: { id: cartId } });
  }

  /**
   * Bumps updatedAt so the abandoned-cart sweep (which orders by it) measures
   * inactivity from the last real change, not from creation.
   */
  private async touch(cartId: string): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }
}
