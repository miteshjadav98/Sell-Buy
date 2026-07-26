import { Injectable } from '@nestjs/common';
import { CouponType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CouponSnapshot } from '../domain/coupon/coupon.specifications';
import { toMinor } from '../domain/pricing/order-totals';
import { ICouponRepository, TxContext } from '../domain/ports/checkout.ports';

/**
 * Coupons, mapped into the shape the eligibility rules expect.
 *
 * The mapping is the interesting part. `value` means two different things
 * depending on `type` — a percentage for PERCENTAGE, a rupee amount for
 * FIXED_AMOUNT — so it is converted to minor units only in the second case.
 * Getting that backwards turns "₹200 off" into "₹2 off" or "20% off" into
 * "2000% off", and only one of those gets reported.
 */
@Injectable()
export class CouponPrismaRepository implements ICouponRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async findByCode(code: string, tx?: TxContext): Promise<CouponSnapshot | null> {
    const coupon = await this.client(tx).coupon.findUnique({ where: { code } });
    if (!coupon) return null;

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value:
        coupon.type === CouponType.PERCENTAGE
          ? Number(coupon.value)
          : toMinor(coupon.value.toString()),
      minCartValueMinor: toMinor(coupon.minCartValue.toString()),
      maxDiscountMinor:
        coupon.maxDiscount === null ? null : toMinor(coupon.maxDiscount.toString()),
      usageLimit: coupon.usageLimit,
      usageCount: coupon.usageCount,
      perUserLimit: coupon.perUserLimit,
      firstOrderOnly: coupon.firstOrderOnly,
      applicableCategoryIds: coupon.applicableCategoryIds,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
    };
  }

  async countUserRedemptions(couponId: string, userId: string, tx?: TxContext): Promise<number> {
    return this.client(tx).couponRedemption.count({ where: { couponId, userId } });
  }

  async isFirstOrder(userId: string, tx?: TxContext): Promise<boolean> {
    /**
     * "First order" counts orders that actually went through. A cancelled or
     * still-unpaid order must not burn the privilege — otherwise abandoning one
     * checkout costs the customer their welcome discount, and they will say so
     * loudly.
     */
    const previous = await this.client(tx).order.count({
      where: {
        userId,
        status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
      },
    });
    return previous === 0;
  }

  async redeem(
    tx: TxContext,
    input: { couponId: string; userId: string; orderId: string; discountMinor: number },
  ): Promise<void> {
    const client = this.client(tx);

    await client.couponRedemption.create({
      data: {
        couponId: input.couponId,
        userId: input.userId,
        orderId: input.orderId,
        discountAmount: new Prisma.Decimal(input.discountMinor / 100),
      },
    });

    /**
     * An atomic increment, not a read-modify-write. Two concurrent checkouts
     * that each read 99 and each write 100 have redeemed a 100-use coupon 101
     * times; `increment` is resolved by the database and cannot lose an update.
     */
    await client.coupon.update({
      where: { id: input.couponId },
      data: { usageCount: { increment: 1 } },
    });
  }
}
