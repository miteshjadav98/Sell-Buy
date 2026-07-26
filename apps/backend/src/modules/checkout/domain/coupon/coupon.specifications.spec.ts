import { CouponType } from '@prisma/client';
import { CouponCandidate, CouponSnapshot, evaluateCoupon } from './coupon.specifications';

/**
 * Coupon rules are where a marketplace bleeds money quietly: a cap that does not
 * cap, a per-user limit that counts the wrong thing, a "first order only" that
 * every order satisfies. Each case here is one of those.
 */

const NOW = new Date('2026-07-25T12:00:00Z');

const coupon = (over: Partial<CouponSnapshot> = {}): CouponSnapshot => ({
  id: 'coupon-1',
  code: 'SAVE20',
  type: CouponType.PERCENTAGE,
  value: 20,
  minCartValueMinor: 0,
  maxDiscountMinor: null,
  usageLimit: null,
  usageCount: 0,
  perUserLimit: 1,
  firstOrderOnly: false,
  applicableCategoryIds: [],
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T23:59:59Z'),
  isActive: true,
  ...over,
});

const candidate = (over: Partial<CouponCandidate> = {}): CouponCandidate => ({
  coupon: coupon(),
  now: NOW,
  eligibleSubtotalMinor: 100_000, // ₹1,000
  userRedemptions: 0,
  isFirstOrder: true,
  ...over,
});

describe('evaluateCoupon — eligibility', () => {
  it('accepts a coupon that satisfies every rule', () => {
    const result = evaluateCoupon(candidate());

    expect(result.isSuccess).toBe(true);
    expect(result.unwrap().amountMinor).toBe(20_000);
  });

  it('refuses an inactive coupon', () => {
    const result = evaluateCoupon(candidate({ coupon: coupon({ isActive: false }) }));

    expect(result.isFailure).toBe(true);
    expect((result as { error: string }).error).toBe('This coupon is no longer available');
  });

  it('refuses one that has not started', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ startsAt: new Date('2026-12-01T00:00:00Z') }) }),
    );

    expect((result as { error: string }).error).toBe('This coupon is not active yet');
  });

  it('refuses an expired coupon', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ expiresAt: new Date('2026-07-01T00:00:00Z') }) }),
    );

    expect((result as { error: string }).error).toBe('This coupon has expired');
  });

  it('refuses one that is globally exhausted', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ usageLimit: 100, usageCount: 100 }) }),
    );

    expect((result as { error: string }).error).toBe('This coupon has been fully redeemed');
  });

  it('refuses a user who has already used it', () => {
    const result = evaluateCoupon(candidate({ userRedemptions: 1 }));

    expect((result as { error: string }).error).toBe('You have already used this coupon');
  });

  it('allows a second use when the per-user limit permits it', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ perUserLimit: 3 }), userRedemptions: 1 }),
    );

    expect(result.isSuccess).toBe(true);
  });

  it('refuses a first-order coupon to a returning customer', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ firstOrderOnly: true }), isFirstOrder: false }),
    );

    expect((result as { error: string }).error).toBe(
      'This coupon is only valid on your first order',
    );
  });

  it('tells the shopper exactly how much more they need', () => {
    const result = evaluateCoupon(
      candidate({
        coupon: coupon({ minCartValueMinor: 150_000 }),
        eligibleSubtotalMinor: 100_000,
      }),
    );

    expect((result as { error: string }).error).toBe('Add ₹500.00 more to use this coupon');
  });

  it('refuses when nothing in the cart is eligible', () => {
    const result = evaluateCoupon(candidate({ eligibleSubtotalMinor: 0 }));

    expect((result as { error: string }).error).toBe(
      'This coupon does not apply to anything in your cart',
    );
  });

  it('reports only the first unmet rule, not all of them', () => {
    // Expired AND already used AND under the minimum — the shopper hears the one
    // that matters most, which is that the coupon is dead.
    const result = evaluateCoupon(
      candidate({
        coupon: coupon({
          expiresAt: new Date('2026-01-02T00:00:00Z'),
          minCartValueMinor: 999_999,
        }),
        userRedemptions: 5,
      }),
    );

    expect((result as { error: string }).error).toBe('This coupon has expired');
  });
});

describe('evaluateCoupon — the amount', () => {
  it('caps a percentage coupon', () => {
    // 20% of ₹50,000 is ₹10,000; the cap is what stops a sale becoming a gift.
    const result = evaluateCoupon(
      candidate({
        coupon: coupon({ maxDiscountMinor: 200_000 }),
        eligibleSubtotalMinor: 5_000_000,
      }),
    );

    expect(result.unwrap().amountMinor).toBe(200_000);
  });

  it('takes a fixed amount as-is when the basket covers it', () => {
    const result = evaluateCoupon(
      candidate({
        coupon: coupon({ type: CouponType.FIXED_AMOUNT, value: 30_000 }),
      }),
    );

    expect(result.unwrap().amountMinor).toBe(30_000);
  });

  it('clamps a fixed amount to the eligible subtotal', () => {
    const result = evaluateCoupon(
      candidate({
        coupon: coupon({ type: CouponType.FIXED_AMOUNT, value: 500_00 }),
        eligibleSubtotalMinor: 30_000,
      }),
    );

    expect(result.unwrap().amountMinor).toBe(30_000);
  });

  it('gives a free-shipping coupon no money off, only free delivery', () => {
    const result = evaluateCoupon(
      candidate({ coupon: coupon({ type: CouponType.FREE_SHIPPING, value: 0 }) }),
    );

    const discount = result.unwrap();
    expect(discount.amountMinor).toBe(0);
    expect(discount.freeShipping).toBe(true);
  });
});
