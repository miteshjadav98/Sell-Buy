import { PaymentMethod } from '@prisma/client';
import { OrderTotals, toDecimal } from '../domain/pricing/order-totals';
import { CheckoutLine, DeliveryAddress } from '../domain/ports/checkout.ports';

/**
 * What the review screen renders.
 *
 * Money crosses the wire as decimals because that is what a UI formats and what
 * JSON consumers expect; it is only ever *computed* in minor units. The
 * conversion happens here, at the very edge, and nowhere upstream.
 */

export interface CheckoutLineView {
  variantId: string;
  productTitle: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  tax: number;
  available: number;
  /** Live price no longer matches what the shopper last saw. */
  priceChanged: boolean;
  /** Delisted, deleted, or the seller went inactive. */
  unavailable: boolean;
  /** Wanted more than exists. */
  insufficientStock: boolean;
}

export interface CheckoutSummaryView {
  cartId: string;
  currency: string;
  lines: CheckoutLineView[];
  address: DeliveryAddress | null;
  totals: {
    subtotal: number;
    discount: number;
    /** Contained within `subtotal` under GST-inclusive pricing — see the tax strategy. */
    tax: number;
    taxIncludedInPrice: boolean;
    shipping: number;
    giftWrap: number;
    total: number;
    totalWeightGrams: number;
  };
  coupon: {
    code: string | null;
    applied: boolean;
    discount: number;
    freeShipping: boolean;
    /** Why an offered code was refused — shown next to the coupon field. */
    rejectedReason: string | null;
  };
  /** Methods the storefront should render right now; excludes gateways whose circuit is open. */
  availablePaymentMethods: PaymentMethod[];
  /**
   * Everything standing between this cart and a successful order. Empty means
   * `POST /checkout` should succeed — though it re-validates under a row lock
   * regardless, because this snapshot goes stale the instant it is returned.
   */
  blockers: string[];
  /** No address chosen yet, so shipping is an estimate. */
  addressRequired: boolean;
}

export interface BuildSummaryInput {
  cartId: string;
  lines: CheckoutLine[];
  totals: OrderTotals;
  stock: Map<string, number>;
  address: DeliveryAddress | null;
  couponCode: string | null;
  couponApplied: boolean;
  couponFreeShipping: boolean;
  couponRejectedReason: string | null;
  taxIncludedInPrice: boolean;
  availablePaymentMethods: PaymentMethod[];
}

/**
 * Pure assembly: no I/O, no decisions the pricing pipeline has not already made.
 * The blockers list is built once here rather than recomputed by the preview
 * endpoint and the place-order path separately, so the reasons a customer is
 * shown are exactly the reasons the server will act on.
 */
export function buildCheckoutSummary(input: BuildSummaryInput): CheckoutSummaryView {
  const blockers: string[] = [];

  const lines: CheckoutLineView[] = input.totals.lines.map((priced, index) => {
    const source = input.lines[index];
    const available = input.stock.get(source.variantId) ?? 0;
    const unavailable = !source.purchasable;
    const insufficientStock = source.quantity > available;

    if (unavailable) blockers.push(`"${source.productTitle}" is no longer available`);
    else if (insufficientStock) {
      blockers.push(
        available > 0
          ? `Only ${available} left of "${source.productTitle}"`
          : `"${source.productTitle}" is out of stock`,
      );
    }

    return {
      variantId: source.variantId,
      productTitle: source.productTitle,
      variantName: source.variantName,
      sku: source.sku,
      imageUrl: source.imageUrl,
      quantity: source.quantity,
      unitPrice: toDecimal(source.unitPriceMinor),
      lineTotal: toDecimal(priced.netMinor),
      discount: toDecimal(priced.discountMinor),
      tax: toDecimal(priced.taxMinor),
      available,
      priceChanged: source.unitPriceMinor !== source.priceSnapshotMinor,
      unavailable,
      insufficientStock,
    };
  });

  if (lines.length === 0) blockers.push('Your cart is empty');
  if (!input.address) blockers.push('Choose a delivery address');

  return {
    cartId: input.cartId,
    currency: input.totals.currency,
    lines,
    address: input.address,
    totals: {
      subtotal: toDecimal(input.totals.subtotalMinor),
      discount: toDecimal(input.totals.discountMinor),
      tax: toDecimal(input.totals.taxMinor),
      taxIncludedInPrice: input.taxIncludedInPrice,
      shipping: toDecimal(input.totals.shippingMinor),
      giftWrap: toDecimal(input.totals.giftWrapMinor),
      total: toDecimal(input.totals.totalMinor),
      totalWeightGrams: input.totals.totalWeightGrams,
    },
    coupon: {
      code: input.couponCode,
      applied: input.couponApplied,
      discount: toDecimal(input.totals.discountMinor),
      freeShipping: input.couponFreeShipping,
      rejectedReason: input.couponRejectedReason,
    },
    availablePaymentMethods: input.availablePaymentMethods,
    blockers,
    addressRequired: input.address === null,
  };
}
