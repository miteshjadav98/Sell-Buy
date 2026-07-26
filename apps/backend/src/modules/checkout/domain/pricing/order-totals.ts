import { ORDER_CURRENCY } from '../checkout.policy';
import { IShippingStrategy } from './shipping.strategy';
import { ITaxStrategy } from './tax.strategy';

/**
 * The money pipeline, as one pure function.
 *
 * Every figure on an invoice is derived here and nowhere else, so the preview
 * endpoint and the order that gets written cannot disagree — a customer seeing
 * ₹1,204 on the review screen and ₹1,209 on the receipt is a support ticket and
 * a chargeback, and it happens whenever two code paths each do their own
 * arithmetic.
 *
 * Pure and synchronous by design: no repositories, no clock, no I/O. Given the
 * same lines it returns the same totals, which is what makes the awkward
 * cases — a coupon that rounds unevenly across five lines, a discount larger
 * than the basket — testable without a database.
 *
 * All arithmetic is in integer minor units (paise). `0.1 + 0.2 !== 0.3`, and a
 * marketplace that discovers this in its ledger discovers it slowly.
 */

export interface PricedLineInput {
  variantId: string;
  quantity: number;
  /** Live price from the database, in minor units. Never from the client. */
  unitPriceMinor: number;
  /** The product's tax rate, e.g. 18. */
  taxRatePercent: number;
  weightGrams: number;
  /** Used to decide whether a category-restricted coupon covers this line. */
  categoryId: string;
}

export interface AppliedDiscount {
  code: string;
  /** Money off the merchandise, in minor units. */
  amountMinor: number;
  freeShipping: boolean;
  /** Empty means the discount spreads over every line. */
  eligibleVariantIds: string[];
}

export interface PricedLine extends PricedLineInput {
  /** unit × quantity. */
  grossMinor: number;
  /** This line's share of the order discount. */
  discountMinor: number;
  /** gross − discount: what the customer actually pays for this line. */
  netMinor: number;
  /** Tax on the net value — contained within it under an inclusive strategy. */
  taxMinor: number;
  taxRateApplied: number;
}

export interface OrderTotals {
  lines: PricedLine[];
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  /**
   * Total tax. Under GST-inclusive pricing this is *contained in* `subtotalMinor`
   * and is reported for the invoice, not added to the total — see
   * `taxIsIncludedInPrice` on the strategy.
   */
  taxMinor: number;
  shippingMinor: number;
  giftWrapMinor: number;
  totalWeightGrams: number;
  totalMinor: number;
}

export interface ComputeTotalsInput {
  lines: PricedLineInput[];
  discount: AppliedDiscount | null;
  destinationPostalCode: string;
  giftWrapFeeMinor: number;
  currency?: string;
}

/**
 * Splits `amount` across `weights` so the parts sum to EXACTLY `amount`.
 *
 * Largest-remainder: floor every share, then hand the leftover units one at a
 * time to whoever lost the most in rounding. Rounding each share independently
 * is the obvious approach and it is wrong — a ₹100 discount over three equal
 * lines becomes ₹33.33 × 3 = ₹99.99, and the missing paisa lands in a
 * reconciliation report every night forever.
 */
export function allocateProRata(amount: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (amount <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (amount * w) / totalWeight);
  const shares = exact.map(Math.floor);

  let remainder = amount - shares.reduce((sum, s) => sum + s, 0);

  // Largest fractional part wins; ties go to the earlier line so the split is
  // deterministic and a preview matches the order that follows it.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0 && i < order.length; i += 1, remainder -= 1) {
    shares[order[i].index] += 1;
  }

  return shares;
}

export function computeOrderTotals(
  input: ComputeTotalsInput,
  tax: ITaxStrategy,
  shipping: IShippingStrategy,
): OrderTotals {
  const { lines, discount, destinationPostalCode, giftWrapFeeMinor } = input;

  const gross = lines.map((line) => line.unitPriceMinor * line.quantity);
  const subtotalMinor = gross.reduce((sum, value) => sum + value, 0);

  /**
   * A category-restricted coupon may only discount the lines it covers, so the
   * allocation weights are zero for everything else. That also means the
   * discount cannot spill onto an ineligible line through rounding.
   */
  const eligible = discount?.eligibleVariantIds ?? [];
  const weights =
    eligible.length === 0
      ? gross
      : lines.map((line, i) => (eligible.includes(line.variantId) ? gross[i] : 0));

  const eligibleTotal = weights.reduce((sum, w) => sum + w, 0);
  // Clamped so a discount can never exceed what it is allowed to discount, and
  // therefore can never produce a negative line.
  const discountMinor = Math.max(0, Math.min(discount?.amountMinor ?? 0, eligibleTotal));
  const allocation = allocateProRata(discountMinor, weights);

  const priced: PricedLine[] = lines.map((line, i) => {
    const netMinor = gross[i] - allocation[i];
    return {
      ...line,
      grossMinor: gross[i],
      discountMinor: allocation[i],
      netMinor,
      taxMinor: tax.taxFor({ netMinor, taxRatePercent: line.taxRatePercent }),
      taxRateApplied: line.taxRatePercent,
    };
  });

  const taxMinor = priced.reduce((sum, line) => sum + line.taxMinor, 0);
  const merchandiseMinor = subtotalMinor - discountMinor;
  const totalWeightGrams = lines.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0);

  const shippingMinor = shipping.feeFor({
    merchandiseMinor,
    totalWeightGrams,
    destinationPostalCode,
    freeShippingApplied: discount?.freeShipping ?? false,
  });

  const giftWrapMinor = giftWrapFeeMinor;

  /**
   * Tax is added only when the strategy says prices exclude it. Adding it under
   * GST-inclusive pricing would charge the customer 18% twice — the single most
   * expensive line in this file to get wrong.
   */
  const totalMinor =
    merchandiseMinor + shippingMinor + giftWrapMinor + (tax.taxIsIncludedInPrice ? 0 : taxMinor);

  return {
    lines: priced,
    currency: input.currency ?? ORDER_CURRENCY,
    subtotalMinor,
    discountMinor,
    taxMinor,
    shippingMinor,
    giftWrapMinor,
    totalWeightGrams,
    totalMinor: Math.max(0, totalMinor),
  };
}

/** Minor units → the decimal Prisma stores in a `Decimal(12,2)` column. */
export const toDecimal = (minor: number): number => minor / 100;

/** Decimal from the database → minor units, rounded half-up. */
export const toMinor = (decimal: number | string): number =>
  Math.round(Number(decimal) * 100);
