import { CouponType } from '@prisma/client';
import { Result, fail, ok } from '../../../../core/domain/result';
import { ISpecification, allOf } from './specification';

/**
 * A coupon as the rules need it — money in minor units, dates as dates, nothing
 * Prisma-shaped. The repository maps the row into this; every rule below reads
 * only from here, which is why they can be unit-tested with an object literal.
 */
export interface CouponSnapshot {
  id: string;
  code: string;
  type: CouponType;
  /** Percent for PERCENTAGE, minor units for FIXED_AMOUNT, ignored for FREE_SHIPPING. */
  value: number;
  minCartValueMinor: number;
  maxDiscountMinor: number | null;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number;
  firstOrderOnly: boolean;
  /** Empty means the coupon applies to the whole catalogue. */
  applicableCategoryIds: string[];
  startsAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

/** Everything a rule may consider. Facts only — no repositories, no clock. */
export interface CouponCandidate {
  coupon: CouponSnapshot;
  now: Date;
  /** Value of the lines the coupon may discount, in minor units. */
  eligibleSubtotalMinor: number;
  /** Times this user has already redeemed this coupon. */
  userRedemptions: number;
  /** True when the user has never had an order confirmed. */
  isFirstOrder: boolean;
}

class CouponIsActive implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon is no longer available';
  isSatisfiedBy({ coupon }: CouponCandidate): boolean {
    return coupon.isActive;
  }
}

class CouponHasStarted implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon is not active yet';
  isSatisfiedBy({ coupon, now }: CouponCandidate): boolean {
    return coupon.startsAt.getTime() <= now.getTime();
  }
}

class CouponHasNotExpired implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon has expired';
  isSatisfiedBy({ coupon, now }: CouponCandidate): boolean {
    return coupon.expiresAt.getTime() > now.getTime();
  }
}

class GlobalUsageLimitNotReached implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon has been fully redeemed';
  isSatisfiedBy({ coupon }: CouponCandidate): boolean {
    return coupon.usageLimit === null || coupon.usageCount < coupon.usageLimit;
  }
}

class PerUserLimitNotReached implements ISpecification<CouponCandidate> {
  readonly reason = 'You have already used this coupon';
  isSatisfiedBy({ coupon, userRedemptions }: CouponCandidate): boolean {
    return userRedemptions < coupon.perUserLimit;
  }
}

class FirstOrderRequirementMet implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon is only valid on your first order';
  isSatisfiedBy({ coupon, isFirstOrder }: CouponCandidate): boolean {
    return !coupon.firstOrderOnly || isFirstOrder;
  }
}

/**
 * Also the rule that catches a category-restricted coupon meeting a cart with
 * nothing eligible in it: `eligibleSubtotalMinor` is already filtered to the
 * applicable categories, so zero means "none of these items qualify".
 */
class CartContainsEligibleItems implements ISpecification<CouponCandidate> {
  readonly reason = 'This coupon does not apply to anything in your cart';
  isSatisfiedBy({ eligibleSubtotalMinor }: CouponCandidate): boolean {
    return eligibleSubtotalMinor > 0;
  }
}

class MinimumCartValueMet implements ISpecification<CouponCandidate> {
  constructor(private readonly formatMoney: (minor: number) => string) {}

  private shortfall = 0;

  get reason(): string {
    return `Add ${this.formatMoney(this.shortfall)} more to use this coupon`;
  }

  isSatisfiedBy({ coupon, eligibleSubtotalMinor }: CouponCandidate): boolean {
    this.shortfall = Math.max(0, coupon.minCartValueMinor - eligibleSubtotalMinor);
    return this.shortfall === 0;
  }
}

const formatRupees = (minor: number): string => `₹${(minor / 100).toFixed(2)}`;

/**
 * The eligibility rules, in the order a shopper should hear about them.
 *
 * "Expired" before "you already used it" before "your cart is too small",
 * because a coupon that no longer exists makes the other two irrelevant, and the
 * shortfall message is the only one that tells them what to do next — so it goes
 * last, where it is what they actually see.
 */
export const couponEligibility = () =>
  allOf<CouponCandidate>(
    new CouponIsActive(),
    new CouponHasStarted(),
    new CouponHasNotExpired(),
    new GlobalUsageLimitNotReached(),
    new PerUserLimitNotReached(),
    new FirstOrderRequirementMet(),
    new CartContainsEligibleItems(),
    new MinimumCartValueMet(formatRupees),
  );

export interface CouponDiscount {
  couponId: string;
  code: string;
  /** Money off the merchandise, in minor units. Zero for a FREE_SHIPPING coupon. */
  amountMinor: number;
  freeShipping: boolean;
}

/**
 * Decides whether a coupon applies and, if so, what it is worth.
 *
 * Returns a `Result` rather than throwing: "coupon expired" is a perfectly
 * ordinary answer to a perfectly ordinary question, and modelling it as a value
 * forces the caller to handle it. Exceptions stay for the database being gone.
 *
 * The discount can never exceed the eligible merchandise value — a ₹500 coupon
 * on a ₹300 basket takes ₹300, not ₹500 plus a refund of the difference, which
 * is how a fixed-amount coupon becomes a way to withdraw cash.
 */
export function evaluateCoupon(candidate: CouponCandidate): Result<CouponDiscount, string> {
  const unmet = couponEligibility().firstUnsatisfiedBy(candidate);
  if (unmet) return fail(unmet.reason);

  const { coupon, eligibleSubtotalMinor } = candidate;

  if (coupon.type === CouponType.FREE_SHIPPING) {
    return ok({ couponId: coupon.id, code: coupon.code, amountMinor: 0, freeShipping: true });
  }

  const raw =
    coupon.type === CouponType.PERCENTAGE
      ? Math.round((eligibleSubtotalMinor * coupon.value) / 100)
      : Math.round(coupon.value);

  // A percentage cap is what stops "20% off" costing ₹40,000 on a laptop.
  const capped = coupon.maxDiscountMinor !== null ? Math.min(raw, coupon.maxDiscountMinor) : raw;

  return ok({
    couponId: coupon.id,
    code: coupon.code,
    amountMinor: Math.max(0, Math.min(capped, eligibleSubtotalMinor)),
    freeShipping: false,
  });
}
