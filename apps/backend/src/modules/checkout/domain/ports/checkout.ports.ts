import { OrderStatus, PaymentGateway, PaymentMethod, PaymentStatus } from '@prisma/client';
import { CouponSnapshot } from '../coupon/coupon.specifications';

/**
 * Everything checkout needs from the rest of the system, expressed as interfaces
 * checkout owns.
 *
 * Each port is deliberately narrow. `ICheckoutCartReader` can read a cart for
 * checkout and mark it converted — it cannot add items, because checkout has no
 * business doing that (Interface Segregation, with a real consequence: the fake
 * in a test is four lines instead of twenty).
 *
 * Every method that participates in the order transaction takes `tx`. That is
 * not incidental plumbing — the whole correctness argument for checkout is that
 * the stock check, the order insert and the reservation happen inside one
 * transaction, and a port that could not join it would quietly break that.
 */

export const CHECKOUT_CART_READER = Symbol('CHECKOUT_CART_READER');
export const CHECKOUT_ADDRESS_READER = Symbol('CHECKOUT_ADDRESS_READER');
export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const WEBHOOK_EVENT_REPOSITORY = Symbol('WEBHOOK_EVENT_REPOSITORY');

/** Opaque transaction handle; only the Prisma adapters know what it really is. */
export type TxContext = unknown;

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

/**
 * A cart line with everything checkout must price and snapshot it — joined from
 * the catalogue at read time rather than trusted from the cart row, because the
 * cart's `priceSnapshot` is a display aid and the price may have moved since.
 */
export interface CheckoutLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  sellerId: string;
  categoryId: string;
  productTitle: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  /** Live price, minor units. */
  unitPriceMinor: number;
  /** What the shopper last saw, minor units — drives the "price changed" notice. */
  priceSnapshotMinor: number;
  taxRatePercent: number;
  weightGrams: number;
  quantity: number;
  /** Variant active AND product live AND not soft-deleted. */
  purchasable: boolean;
}

export interface CheckoutCart {
  cartId: string;
  couponCode: string | null;
  giftWrap: boolean;
  lines: CheckoutLine[];
}

export interface ICheckoutCartReader {
  /**
   * The user's active cart with its checkout-ready lines. Excludes
   * saved-for-later, which is a wishlist by another name and must never be
   * silently purchased.
   */
  loadForUser(userId: string, tx?: TxContext): Promise<CheckoutCart | null>;

  /** Cart → CONVERTED, so it is not offered again after the order is placed. */
  markConverted(tx: TxContext, cartId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export interface DeliveryAddress {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface IAddressReader {
  /**
   * Scoped to the owner on purpose. `findById(addressId)` would let anyone ship
   * an order to any address in the database by guessing a uuid — authorisation
   * belongs in the query, not in an `if` the next caller forgets.
   */
  findOwned(userId: string, addressId: string): Promise<DeliveryAddress | null>;
  findDefault(userId: string): Promise<DeliveryAddress | null>;
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export interface ICouponRepository {
  findByCode(code: string, tx?: TxContext): Promise<CouponSnapshot | null>;
  countUserRedemptions(couponId: string, userId: string, tx?: TxContext): Promise<number>;
  /** True when the user has never had an order reach a confirmed state. */
  isFirstOrder(userId: string, tx?: TxContext): Promise<boolean>;
  /**
   * Records the redemption and bumps the global counter, inside the order
   * transaction — otherwise a coupon limited to 100 uses is redeemed 140 times
   * by concurrent checkouts, and the campaign budget is someone's problem on
   * Monday.
   */
  redeem(
    tx: TxContext,
    input: { couponId: string; userId: string; orderId: string; discountMinor: number },
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface NewOrderItem {
  variantId: string;
  sellerId: string;
  productTitle: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPriceMinor: number;
  quantity: number;
  discountMinor: number;
  taxRatePercent: number;
  taxMinor: number;
  totalMinor: number;
}

export interface NewOrder {
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  giftWrapMinor: number;
  totalMinor: number;
  currency: string;
  shippingAddress: DeliveryAddress;
  billingAddress: DeliveryAddress | null;
  couponCode: string | null;
  customerNote: string | null;
  idempotencyKey: string;
  items: NewOrderItem[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  sellerIds: string[];
}

export interface ExpiredOrder {
  id: string;
  orderNumber: string;
  userId: string;
}

export interface IOrderRepository {
  create(tx: TxContext, order: NewOrder): Promise<OrderSummary>;

  /**
   * The retry guard. A customer double-tapping "Pay" or a mobile client
   * retrying a timed-out request must not produce two orders and two charges;
   * the unique index on `idempotencyKey` makes the second attempt return the
   * first order instead of creating one.
   */
  findByIdempotencyKey(userId: string, key: string, tx?: TxContext): Promise<OrderSummary | null>;

  findById(orderId: string, tx?: TxContext): Promise<OrderSummary | null>;

  /** Status change plus the history row, always together. */
  updateStatus(
    tx: TxContext,
    orderId: string,
    status: OrderStatus,
    note?: string,
  ): Promise<void>;

  cancel(tx: TxContext, orderId: string, reason: string): Promise<void>;

  /** PENDING_PAYMENT orders placed before `cutoff` — the sweeper's input. */
  findExpired(cutoff: Date, limit: number): Promise<ExpiredOrder[]>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface NewPayment {
  orderId: string;
  gateway: PaymentGateway;
  method: PaymentMethod;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  gateway: PaymentGateway;
  method: PaymentMethod;
  status: PaymentStatus;
  amountMinor: number;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
}

export interface IPaymentRepository {
  create(tx: TxContext, payment: NewPayment): Promise<PaymentRecord>;
  attachGatewayOrder(paymentId: string, gatewayOrderId: string): Promise<void>;
  findByGatewayOrderId(gatewayOrderId: string, tx?: TxContext): Promise<PaymentRecord | null>;
  findPendingForOrder(orderId: string, tx?: TxContext): Promise<PaymentRecord | null>;

  markCaptured(
    tx: TxContext,
    paymentId: string,
    input: { gatewayPaymentId: string; signature?: string; raw?: unknown },
  ): Promise<void>;

  markFailed(
    tx: TxContext,
    paymentId: string,
    input: { reason: string; raw?: unknown },
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface IWebhookEventRepository {
  /**
   * Records the delivery and reports whether this is the first time we have seen
   * it. Gateways retry aggressively and will deliver the same event a dozen
   * times; without this, the same capture credits stock and sends a confirmation
   * email twelve times.
   *
   * The uniqueness check must be a database constraint rather than a
   * read-then-write, because two retries can arrive concurrently on two pods.
   */
  recordIfNew(input: {
    gateway: PaymentGateway;
    eventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<boolean>;

  markProcessed(gateway: PaymentGateway, eventId: string, error?: string): Promise<void>;
}
