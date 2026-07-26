/**
 * Strategy — how the delivery charge is worked out.
 *
 * Shipping is priced by whoever is winning the argument this quarter: flat rate,
 * free over a threshold, by weight, by zone, by carrier quote. Each of those is
 * a class here. None of them is an `if` inside checkout.
 */

export const SHIPPING_STRATEGY = Symbol('SHIPPING_STRATEGY');

export interface ShipmentContext {
  /** Merchandise value after discount, in minor units — thresholds apply to what is actually paid. */
  merchandiseMinor: number;
  totalWeightGrams: number;
  destinationPostalCode: string;
  /** A FREE_SHIPPING coupon was applied and satisfied. */
  freeShippingApplied: boolean;
}

export interface IShippingStrategy {
  readonly name: string;
  /** Delivery charge in minor units. */
  feeFor(context: ShipmentContext): number;
}

/**
 * Weight bands, with free delivery over a threshold and a surcharge for the
 * postcodes that genuinely cost more to reach.
 *
 * Weight bands rather than a flat fee because a 40 kg treadmill and a phone case
 * do not cost the same to move, and a marketplace that pretends otherwise
 * subsidises heavy goods out of the margin on light ones.
 *
 * The free-shipping threshold is measured on the DISCOUNTED value. Measuring it
 * on the pre-discount subtotal lets a coupon push a basket under the threshold
 * while still earning free delivery — the customer pays less and we absorb both.
 */
export class WeightBandedShippingStrategy implements IShippingStrategy {
  readonly name = 'WEIGHT_BANDED';

  /** Free delivery at or above ₹499 of merchandise. */
  private static readonly FREE_THRESHOLD_MINOR = 49_900;

  /** Upper bound of each band (grams) and its charge (minor units). */
  private static readonly BANDS: ReadonlyArray<{ maxGrams: number; feeMinor: number }> = [
    { maxGrams: 500, feeMinor: 4_000 }, // ₹40
    { maxGrams: 2_000, feeMinor: 7_000 }, // ₹70
    { maxGrams: 5_000, feeMinor: 12_000 }, // ₹120
  ];

  /** Beyond the last band, per additional kilogram (or part of one). */
  private static readonly PER_EXTRA_KG_MINOR = 2_500;

  /** ₹60 to reach the places carriers charge extra to reach. */
  private static readonly REMOTE_SURCHARGE_MINOR = 6_000;

  /**
   * PIN prefixes treated as remote — the North East, the islands, Ladakh.
   *
   * A hardcoded list is honest about what it is: a stand-in for the carrier
   * serviceability table that belongs in the database once one exists. It is
   * here rather than in the use case so replacing it is a change to this class
   * and nothing else.
   */
  private static readonly REMOTE_PREFIXES = ['19', '73', '78', '79', '744', '194'];

  feeFor(context: ShipmentContext): number {
    if (context.freeShippingApplied) return 0;
    if (context.merchandiseMinor >= WeightBandedShippingStrategy.FREE_THRESHOLD_MINOR) return 0;
    // An empty basket is not a delivery.
    if (context.merchandiseMinor <= 0) return 0;

    return this.bandFee(context.totalWeightGrams) + this.surcharge(context.destinationPostalCode);
  }

  private bandFee(weightGrams: number): number {
    const weight = Math.max(0, weightGrams);

    for (const band of WeightBandedShippingStrategy.BANDS) {
      if (weight <= band.maxGrams) return band.feeMinor;
    }

    const last = WeightBandedShippingStrategy.BANDS[WeightBandedShippingStrategy.BANDS.length - 1];
    const extraKg = Math.ceil((weight - last.maxGrams) / 1_000);
    return last.feeMinor + extraKg * WeightBandedShippingStrategy.PER_EXTRA_KG_MINOR;
  }

  private surcharge(postalCode: string): number {
    const pin = postalCode.replace(/\s+/g, '');
    return WeightBandedShippingStrategy.REMOTE_PREFIXES.some((prefix) => pin.startsWith(prefix))
      ? WeightBandedShippingStrategy.REMOTE_SURCHARGE_MINOR
      : 0;
  }
}

/** The simplest thing that could work — kept for tests and for small-catalogue deployments. */
export class FlatRateShippingStrategy implements IShippingStrategy {
  readonly name = 'FLAT_RATE';

  constructor(private readonly feeMinor = 5_000) {}

  feeFor(context: ShipmentContext): number {
    if (context.freeShippingApplied || context.merchandiseMinor <= 0) return 0;
    return this.feeMinor;
  }
}
