import { allocateProRata, computeOrderTotals, PricedLineInput } from './order-totals';
import { FlatRateShippingStrategy, WeightBandedShippingStrategy } from './shipping.strategy';
import { GstInclusiveTaxStrategy, TaxExclusiveStrategy } from './tax.strategy';

/**
 * The pricing pipeline is pure, which is the whole reason these tests need no
 * database, no container and no mocks. Every case below is one that costs real
 * money when it is wrong.
 */

const gst = new GstInclusiveTaxStrategy();
const freeShipping = new FlatRateShippingStrategy(0);

const line = (over: Partial<PricedLineInput> = {}): PricedLineInput => ({
  variantId: 'v1',
  quantity: 1,
  unitPriceMinor: 100_000, // ₹1,000
  taxRatePercent: 18,
  weightGrams: 300,
  categoryId: 'c1',
  ...over,
});

describe('allocateProRata', () => {
  it('distributes the exact amount, losing nothing to rounding', () => {
    // ₹100 across three equal lines is 33.33 each — the stray paisa has to land
    // somewhere, and it must not vanish.
    const shares = allocateProRata(10_000, [1, 1, 1]);

    expect(shares.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(shares).toEqual([3_334, 3_333, 3_333]);
  });

  it('weights the split by line value', () => {
    const shares = allocateProRata(1_000, [3_000, 1_000]);

    expect(shares).toEqual([750, 250]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1_000);
  });

  it('gives zero-weight lines nothing', () => {
    // A category-restricted coupon must not leak onto an ineligible line.
    expect(allocateProRata(500, [1_000, 0, 1_000])).toEqual([250, 0, 250]);
  });

  it('returns zeros when there is nothing to allocate', () => {
    expect(allocateProRata(0, [10, 20])).toEqual([0, 0]);
    expect(allocateProRata(500, [0, 0])).toEqual([0, 0]);
  });

  it('is deterministic across repeated runs, so a preview matches the order', () => {
    const first = allocateProRata(9_999, [1_234, 5_678, 91_011]);
    const second = allocateProRata(9_999, [1_234, 5_678, 91_011]);
    expect(first).toEqual(second);
  });
});

describe('computeOrderTotals — GST-inclusive pricing', () => {
  it('extracts tax from the price rather than adding it on top', () => {
    const totals = computeOrderTotals(
      {
        lines: [line()],
        discount: null,
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    // ₹1,000 inclusive of 18% GST → tax = 1000 × 18/118 = ₹152.54
    expect(totals.taxMinor).toBe(15_254);
    // …and the customer still pays ₹1,000, not ₹1,180.
    expect(totals.totalMinor).toBe(100_000);
    expect(totals.subtotalMinor).toBe(100_000);
  });

  it('adds tax on top under an exclusive strategy', () => {
    const totals = computeOrderTotals(
      {
        lines: [line()],
        discount: null,
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      new TaxExclusiveStrategy(),
      freeShipping,
    );

    expect(totals.taxMinor).toBe(18_000);
    expect(totals.totalMinor).toBe(118_000);
  });

  it('taxes the discounted value, not the list price', () => {
    const totals = computeOrderTotals(
      {
        lines: [line()],
        discount: {
          code: 'SAVE200',
          amountMinor: 20_000,
          freeShipping: false,
          eligibleVariantIds: [],
        },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    // Tax on ₹800, not ₹1,000 — no tax is owed on money never paid.
    expect(totals.taxMinor).toBe(Math.round((80_000 * 18) / 118));
    expect(totals.totalMinor).toBe(80_000);
  });
});

describe('computeOrderTotals — discounts', () => {
  it('never lets a discount exceed the basket', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 30_000 })],
        discount: {
          code: 'HUGE',
          amountMinor: 500_00,
          freeShipping: false,
          eligibleVariantIds: [],
        },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    // A ₹500 coupon on a ₹300 basket takes ₹300 — a fixed-amount coupon must
    // not become a way to withdraw cash.
    expect(totals.discountMinor).toBe(30_000);
    expect(totals.totalMinor).toBe(0);
    expect(totals.lines[0].netMinor).toBe(0);
  });

  it('confines a category-restricted discount to eligible lines', () => {
    const totals = computeOrderTotals(
      {
        lines: [
          line({ variantId: 'eligible', unitPriceMinor: 50_000, categoryId: 'books' }),
          line({ variantId: 'other', unitPriceMinor: 50_000, categoryId: 'phones' }),
        ],
        discount: {
          code: 'BOOKS10',
          amountMinor: 5_000,
          freeShipping: false,
          eligibleVariantIds: ['eligible'],
        },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    expect(totals.lines[0].discountMinor).toBe(5_000);
    expect(totals.lines[1].discountMinor).toBe(0);
  });

  it('spreads a discount across lines so the parts sum to the whole', () => {
    const totals = computeOrderTotals(
      {
        lines: [
          line({ variantId: 'a', unitPriceMinor: 33_333 }),
          line({ variantId: 'b', unitPriceMinor: 33_333 }),
          line({ variantId: 'c', unitPriceMinor: 33_334 }),
        ],
        discount: { code: 'TEN', amountMinor: 10_000, freeShipping: false, eligibleVariantIds: [] },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    const allocated = totals.lines.reduce((sum, l) => sum + l.discountMinor, 0);
    expect(allocated).toBe(10_000);
  });
});

describe('computeOrderTotals — shipping', () => {
  const weighted = new WeightBandedShippingStrategy();

  it('charges by weight band below the free-shipping threshold', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 20_000, weightGrams: 1_500 })],
        discount: null,
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      weighted,
    );

    expect(totals.shippingMinor).toBe(7_000); // 500g–2kg band
    expect(totals.totalMinor).toBe(27_000);
  });

  it('ships free at or above the threshold', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 49_900, weightGrams: 4_000 })],
        discount: null,
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      weighted,
    );

    expect(totals.shippingMinor).toBe(0);
  });

  it('measures the free-shipping threshold after the discount', () => {
    // ₹520 basket less ₹100 is ₹420 — below the threshold, so delivery is
    // charged. Testing it against the pre-discount subtotal would give the
    // customer both the discount and free delivery.
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 52_000, weightGrams: 200 })],
        discount: {
          code: 'HUNDRED',
          amountMinor: 10_000,
          freeShipping: false,
          eligibleVariantIds: [],
        },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      weighted,
    );

    expect(totals.shippingMinor).toBe(4_000);
  });

  it('surcharges remote postcodes', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 20_000, weightGrams: 200 })],
        discount: null,
        destinationPostalCode: '795001', // North East
        giftWrapFeeMinor: 0,
      },
      gst,
      weighted,
    );

    expect(totals.shippingMinor).toBe(4_000 + 6_000);
  });

  it('honours a free-shipping coupon regardless of basket value', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 10_000, weightGrams: 9_000 })],
        discount: { code: 'FREESHIP', amountMinor: 0, freeShipping: true, eligibleVariantIds: [] },
        destinationPostalCode: '795001',
        giftWrapFeeMinor: 0,
      },
      gst,
      weighted,
    );

    expect(totals.shippingMinor).toBe(0);
  });
});

describe('computeOrderTotals — the total', () => {
  it('is subtotal − discount + shipping + gift wrap, with inclusive tax not added again', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ unitPriceMinor: 20_000, quantity: 2, weightGrams: 400 })],
        discount: { code: 'X', amountMinor: 5_000, freeShipping: false, eligibleVariantIds: [] },
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 4_900,
      },
      gst,
      new WeightBandedShippingStrategy(),
    );

    expect(totals.subtotalMinor).toBe(40_000);
    expect(totals.discountMinor).toBe(5_000);
    expect(totals.shippingMinor).toBe(7_000); // 800g
    expect(totals.giftWrapMinor).toBe(4_900);
    expect(totals.totalMinor).toBe(40_000 - 5_000 + 7_000 + 4_900);
  });

  it('sums line weights by quantity', () => {
    const totals = computeOrderTotals(
      {
        lines: [line({ quantity: 3, weightGrams: 250 }), line({ variantId: 'v2', weightGrams: 100 })],
        discount: null,
        destinationPostalCode: '560001',
        giftWrapFeeMinor: 0,
      },
      gst,
      freeShipping,
    );

    expect(totals.totalWeightGrams).toBe(850);
  });
});
