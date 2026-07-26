import { Inject, Injectable } from '@nestjs/common';
import { GIFT_WRAP_FEE_MINOR } from '../../domain/checkout.policy';
import {
  CouponDiscount,
  evaluateCoupon,
} from '../../domain/coupon/coupon.specifications';
import {
  AppliedDiscount,
  OrderTotals,
  PricedLineInput,
  computeOrderTotals,
} from '../../domain/pricing/order-totals';
import { IShippingStrategy, SHIPPING_STRATEGY } from '../../domain/pricing/shipping.strategy';
import { ITaxStrategy, TAX_STRATEGY } from '../../domain/pricing/tax.strategy';
import {
  CheckoutLine,
  COUPON_REPOSITORY,
  ICouponRepository,
  TxContext,
} from '../../domain/ports/checkout.ports';

export interface PriceCheckoutInput {
  userId: string;
  lines: CheckoutLine[];
  couponCode: string | null;
  giftWrap: boolean;
  destinationPostalCode: string;
  tx?: TxContext;
  now?: Date;
}

export interface PricedCheckout {
  totals: OrderTotals;
  coupon: CouponDiscount | null;
  /** Set when a code was offered and refused, with the customer-facing reason. */
  couponRejectedReason: string | null;
  taxIncludedInPrice: boolean;
}

/**
 * One place where a basket becomes a set of numbers.
 *
 * Both the preview endpoint and the order that gets written go through here, and
 * that is the entire reason it exists as a service rather than as two similar
 * blocks of code. A review screen that says ₹1,204 and a receipt that says ₹1,209
 * is a chargeback, and it is exactly what happens when two paths each apply the
 * coupon and round the tax in their own way.
 *
 * It resolves the coupon and delegates every rupee of arithmetic to the pure
 * pipeline in `domain/pricing`. The strategies arrive by injection, so the
 * decision "GST is inside the price" and "shipping is priced by weight" are
 * configuration of this service, not knowledge inside it.
 */
@Injectable()
export class CheckoutPricingService {
  constructor(
    @Inject(COUPON_REPOSITORY) private readonly coupons: ICouponRepository,
    @Inject(TAX_STRATEGY) private readonly tax: ITaxStrategy,
    @Inject(SHIPPING_STRATEGY) private readonly shipping: IShippingStrategy,
  ) {}

  async price(input: PriceCheckoutInput): Promise<PricedCheckout> {
    const pricedLines: PricedLineInput[] = input.lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRatePercent: line.taxRatePercent,
      weightGrams: line.weightGrams,
      categoryId: line.categoryId,
    }));

    const { coupon, rejectedReason, discount } = await this.resolveCoupon(input);

    const totals = computeOrderTotals(
      {
        lines: pricedLines,
        discount,
        destinationPostalCode: input.destinationPostalCode,
        giftWrapFeeMinor: input.giftWrap ? GIFT_WRAP_FEE_MINOR : 0,
      },
      this.tax,
      this.shipping,
    );

    return {
      totals,
      coupon,
      couponRejectedReason: rejectedReason,
      taxIncludedInPrice: this.tax.taxIsIncludedInPrice,
    };
  }

  /**
   * An unusable coupon is reported, never fatal.
   *
   * Rejecting the whole checkout because someone pasted an expired code would be
   * absurd on the review screen and actively harmful at order time — the
   * customer has already decided to buy, and a coupon that lapsed while they
   * typed their address must not lose the sale. The order is placed at full
   * price with the reason surfaced.
   */
  private async resolveCoupon(input: PriceCheckoutInput): Promise<{
    coupon: CouponDiscount | null;
    rejectedReason: string | null;
    discount: AppliedDiscount | null;
  }> {
    const code = input.couponCode?.trim().toUpperCase();
    if (!code) return { coupon: null, rejectedReason: null, discount: null };

    const snapshot = await this.coupons.findByCode(code, input.tx);
    if (!snapshot) {
      return { coupon: null, rejectedReason: 'That coupon code is not recognised', discount: null };
    }

    // A category-restricted coupon may only discount the lines it covers, so the
    // minimum-spend test is measured against those lines and not the whole cart.
    const eligibleVariantIds = this.eligibleVariants(input.lines, snapshot.applicableCategoryIds);
    const eligibleSubtotalMinor = input.lines
      .filter((line) => eligibleVariantIds.includes(line.variantId))
      .reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);

    const [userRedemptions, isFirstOrder] = await Promise.all([
      this.coupons.countUserRedemptions(snapshot.id, input.userId, input.tx),
      this.coupons.isFirstOrder(input.userId, input.tx),
    ]);

    const evaluation = evaluateCoupon({
      coupon: snapshot,
      now: input.now ?? new Date(),
      eligibleSubtotalMinor,
      userRedemptions,
      isFirstOrder,
    });

    if (evaluation.isFailure) {
      return { coupon: null, rejectedReason: evaluation.error, discount: null };
    }

    const applied = evaluation.unwrap();
    return {
      coupon: applied,
      rejectedReason: null,
      discount: {
        code: applied.code,
        amountMinor: applied.amountMinor,
        freeShipping: applied.freeShipping,
        eligibleVariantIds:
          snapshot.applicableCategoryIds.length === 0 ? [] : eligibleVariantIds,
      },
    };
  }

  private eligibleVariants(lines: CheckoutLine[], categoryIds: string[]): string[] {
    if (categoryIds.length === 0) return lines.map((line) => line.variantId);
    return lines
      .filter((line) => categoryIds.includes(line.categoryId))
      .map((line) => line.variantId);
  }
}
