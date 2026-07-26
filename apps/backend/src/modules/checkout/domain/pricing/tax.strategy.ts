/**
 * Strategy — how tax is worked out.
 *
 * Tax rules are the part of commerce most likely to change for reasons entirely
 * outside your control: a rate moves, a category is reclassified, the business
 * opens in a second country with a completely different model. Behind an
 * interface, that is a new class; inlined into the checkout use case, it is a
 * change to the most dangerous code in the system.
 */

export const TAX_STRATEGY = Symbol('TAX_STRATEGY');

export interface TaxableLine {
  /** Line value after discount, in minor units. */
  netMinor: number;
  /** The product's rate, e.g. 18 for 18% GST. */
  taxRatePercent: number;
}

export interface ITaxStrategy {
  readonly name: string;
  /**
   * Tax for one line, in minor units.
   *
   * Whether the figure is *contained in* `netMinor` or *added to* it is the
   * strategy's business, and the caller must not assume — see
   * `taxIsIncludedInPrice`.
   */
  taxFor(line: TaxableLine): number;

  /**
   * True when displayed prices already contain the tax. The totals builder needs
   * this to know whether to add the tax figure to the order total or merely
   * report it.
   */
  readonly taxIsIncludedInPrice: boolean;
}

/**
 * Indian GST, the way Indian storefronts actually price.
 *
 * A ₹999 listing is ₹999 at the till — the 18% GST is inside that number, not
 * added at the end. Extracting it rather than appending it is not a rounding
 * preference, it is the law and the customer's expectation: a checkout that
 * turned ₹999 into ₹1,178.82 would be a bug report within the hour.
 *
 * So the tax formula is `net × rate / (100 + rate)`, not `net × rate / 100`, and
 * the order total does not add it back.
 *
 * Note it is computed on the DISCOUNTED line value. A ₹100 discount on a
 * tax-inclusive price reduces the taxable value too — the government is not owed
 * tax on money the customer never paid.
 */
export class GstInclusiveTaxStrategy implements ITaxStrategy {
  readonly name = 'GST_INCLUSIVE';
  readonly taxIsIncludedInPrice = true;

  taxFor({ netMinor, taxRatePercent }: TaxableLine): number {
    if (netMinor <= 0 || taxRatePercent <= 0) return 0;
    return Math.round((netMinor * taxRatePercent) / (100 + taxRatePercent));
  }
}

/**
 * The other half of the world: prices are quoted before tax and it is added at
 * checkout. Unused today — it exists because writing it took four lines and
 * proves the seam is real rather than decorative.
 */
export class TaxExclusiveStrategy implements ITaxStrategy {
  readonly name = 'TAX_EXCLUSIVE';
  readonly taxIsIncludedInPrice = false;

  taxFor({ netMinor, taxRatePercent }: TaxableLine): number {
    if (netMinor <= 0 || taxRatePercent <= 0) return 0;
    return Math.round((netMinor * taxRatePercent) / 100);
  }
}
