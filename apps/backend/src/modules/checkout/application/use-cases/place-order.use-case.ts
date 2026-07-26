import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentGateway, PaymentMethod } from '@prisma/client';
import {
  BusinessRuleError,
  InsufficientStockError,
  NotFoundError,
} from '../../../../common/errors/domain.errors';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../../../../core/application/domain-event-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { PaymentGatewayFactory } from '../../../../infrastructure/payments/payment-gateway.factory';
import {
  IInventoryReservationWriter,
  INVENTORY_RESERVATION_WRITER,
  LockedStock,
  StockAllocation,
} from '../../../inventory/domain/ports/inventory.ports';
import { MAX_LINES_PER_ORDER } from '../../domain/checkout.policy';
import { OrderPlacedEvent } from '../../domain/events/order-placed.event';
import { generateOrderNumber } from '../../domain/order-number';
import { OrderTotals, toDecimal } from '../../domain/pricing/order-totals';
import {
  CHECKOUT_ADDRESS_READER,
  CHECKOUT_CART_READER,
  CheckoutLine,
  COUPON_REPOSITORY,
  DeliveryAddress,
  IAddressReader,
  ICheckoutCartReader,
  ICouponRepository,
  IOrderRepository,
  IPaymentRepository,
  NewOrderItem,
  ORDER_REPOSITORY,
  OrderSummary,
  PAYMENT_REPOSITORY,
  TxContext,
} from '../../domain/ports/checkout.ports';
import { CheckoutPricingService } from '../services/checkout-pricing.service';

export interface PlaceOrderInput {
  userId: string;
  customerEmail: string;
  addressId: string;
  billingAddressId?: string;
  paymentMethod: PaymentMethod;
  preferredGateway?: PaymentGateway;
  couponCode?: string;
  giftWrap?: boolean;
  customerNote?: string;
  /** From the `Idempotency-Key` header. Generated when the client omits it. */
  idempotencyKey?: string;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  currency: string;
  payment: {
    gateway: PaymentGateway;
    method: PaymentMethod;
    gatewayOrderId: string;
    clientToken?: string;
    /** False for COD — the order is already confirmed and there is nothing to pay. */
    requiresClientAction: boolean;
  };
  /** True when the request was a retry and this order already existed. */
  idempotentReplay: boolean;
}

/**
 * Placing an order — the one path in this system where being wrong costs money.
 *
 * The shape below is the whole design, and the boundaries are the point:
 *
 *   ┌─ ONE transaction ────────────────────────────────────────┐
 *   │  lock inventory rows FOR UPDATE                          │
 *   │  verify stock against the locked figures                 │
 *   │  price from the database (never from the client)          │
 *   │  INSERT order (PENDING_PAYMENT) + items                  │
 *   │  reserve stock, redeem coupon, convert the cart          │
 *   └──────────────────── COMMIT ──────────────────────────────┘
 *   then, OUTSIDE it: call the payment gateway
 *
 * The gateway call is outside because a transaction holds row locks, and a
 * checkout that sits inside one for the 8 seconds Razorpay takes to answer
 * blocks every other buyer of the same SKU — one slow vendor becomes a
 * site-wide stall. The cost of that choice is a window where an order exists
 * with no payment intent, which is exactly what the compensating cancel below
 * and the expiry sweeper are for.
 *
 * Stock is reserved rather than decremented because the customer may abandon the
 * gateway page. Reservation blocks oversell immediately and is released by the
 * sweeper after 15 minutes if payment never arrives.
 */
@Injectable()
export class PlaceOrderUseCase implements IUseCase<PlaceOrderInput, PlaceOrderResult> {
  private readonly logger = new Logger(PlaceOrderUseCase.name);

  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(CHECKOUT_CART_READER) private readonly carts: ICheckoutCartReader,
    @Inject(CHECKOUT_ADDRESS_READER) private readonly addresses: IAddressReader,
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(COUPON_REPOSITORY) private readonly coupons: ICouponRepository,
    @Inject(INVENTORY_RESERVATION_WRITER) private readonly inventory: IInventoryReservationWriter,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: IDomainEventPublisher,
    private readonly pricing: CheckoutPricingService,
    private readonly gateways: PaymentGatewayFactory,
  ) {}

  async execute(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const idempotencyKey = input.idempotencyKey ?? randomUUID();

    /**
     * The cheap guard first. A customer double-tapping "Pay", or a mobile client
     * retrying a request that actually succeeded but whose response was lost, must
     * get back the order they already have — not a second order and a second
     * charge. The unique index on `idempotencyKey` is the real enforcement; this
     * read just avoids the work when the answer is already known.
     */
    const existing = await this.orders.findByIdempotencyKey(input.userId, idempotencyKey);
    if (existing) return this.replay(existing, input.paymentMethod);

    const shippingAddress = await this.requireAddress(input.userId, input.addressId);
    const billingAddress = input.billingAddressId
      ? await this.requireAddress(input.userId, input.billingAddressId)
      : null;

    const placed = await this.transactions.runInTransaction(async (tx) =>
      this.placeWithinTransaction(tx, input, idempotencyKey, shippingAddress, billingAddress),
    );

    // ---- Everything past this line runs with the order already committed. ----

    if (input.paymentMethod === PaymentMethod.COD) {
      return this.confirmCashOnDelivery(placed);
    }

    return this.openPaymentIntent(placed, input, shippingAddress);
  }

  /**
   * The transactional core. Every write in here either all lands or none does:
   * an order with no stock behind it, or stock reserved against an order that
   * failed to save, is corruption support untangles by hand for weeks.
   */
  private async placeWithinTransaction(
    tx: TxContext,
    input: PlaceOrderInput,
    idempotencyKey: string,
    shippingAddress: DeliveryAddress,
    billingAddress: DeliveryAddress | null,
  ): Promise<PlacedOrder> {
    const cart = await this.carts.loadForUser(input.userId, tx);
    if (!cart || cart.lines.length === 0) throw new BusinessRuleError('Your cart is empty');
    if (cart.lines.length > MAX_LINES_PER_ORDER) {
      throw new BusinessRuleError(`An order cannot contain more than ${MAX_LINES_PER_ORDER} items`);
    }

    const unavailable = cart.lines.find((line) => !line.purchasable);
    if (unavailable) {
      throw new BusinessRuleError(`"${unavailable.productTitle}" is no longer available`);
    }

    /**
     * Lock first, verify second. Reading availability without the lock is the
     * classic oversell: two checkouts both see "1 left", both pass validation,
     * both reserve, and one customer gets an apology email.
     */
    const locked = await this.inventory.lockForVariants(
      tx,
      cart.lines.map((line) => line.variantId),
    );
    const allocations = this.allocate(cart.lines, locked);

    // Prices come from the rows we just read, never from the request body.
    const priced = await this.pricing.price({
      userId: input.userId,
      lines: cart.lines,
      couponCode: input.couponCode ?? cart.couponCode,
      giftWrap: input.giftWrap ?? cart.giftWrap,
      destinationPostalCode: shippingAddress.postalCode,
      tx,
    });

    const order = await this.orders.create(tx, {
      orderNumber: generateOrderNumber(),
      userId: input.userId,
      // PENDING_PAYMENT even for COD; it is flipped to CONFIRMED after the
      // commit so there is never a moment where a confirmed order has no
      // reservation behind it.
      status: OrderStatus.PENDING_PAYMENT,
      subtotalMinor: priced.totals.subtotalMinor,
      discountMinor: priced.totals.discountMinor,
      taxMinor: priced.totals.taxMinor,
      shippingMinor: priced.totals.shippingMinor,
      giftWrapMinor: priced.totals.giftWrapMinor,
      totalMinor: priced.totals.totalMinor,
      currency: priced.totals.currency,
      shippingAddress,
      billingAddress,
      couponCode: priced.coupon?.code ?? null,
      customerNote: input.customerNote ?? null,
      idempotencyKey,
      items: this.toOrderItems(cart.lines, priced.totals),
    });

    await this.inventory.reserve(tx, order.id, allocations);

    if (priced.coupon) {
      // Inside the transaction, because a coupon capped at 100 uses that is
      // counted after the commit gets redeemed 140 times by concurrent
      // checkouts, and the campaign budget becomes someone's Monday.
      await this.coupons.redeem(tx, {
        couponId: priced.coupon.couponId,
        userId: input.userId,
        orderId: order.id,
        discountMinor: priced.coupon.amountMinor,
      });
    }

    await this.carts.markConverted(tx, cart.cartId);

    const gateway = this.gatewayNameFor(input);
    const payment = await this.payments.create(tx, {
      orderId: order.id,
      gateway,
      method: input.paymentMethod,
      amountMinor: priced.totals.totalMinor,
      currency: priced.totals.currency,
      // Derived from the order's key so a retry reaching the gateway is
      // recognised there too, not just here.
      idempotencyKey: `pay_${idempotencyKey}`,
    });

    return { order, paymentId: payment.id, totals: priced.totals };
  }

  /**
   * Spreads each line's quantity across the warehouses holding that variant.
   *
   * Refuses the whole order if any line cannot be filled, rather than silently
   * shipping four of the five somebody ordered. A partial basket is a decision
   * for the customer to make on the cart page, not one to make on their behalf
   * after taking their money.
   */
  private allocate(lines: CheckoutLine[], locked: LockedStock[]): StockAllocation[] {
    const byVariant = new Map<string, LockedStock[]>();
    for (const row of locked) {
      const rows = byVariant.get(row.variantId) ?? [];
      rows.push(row);
      byVariant.set(row.variantId, rows);
    }

    const allocations: StockAllocation[] = [];

    for (const line of lines) {
      // Fullest warehouse first, so an order is split across as few shipments as
      // possible.
      const rows = (byVariant.get(line.variantId) ?? [])
        .slice()
        .sort((a, b) => b.available - a.available);

      const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
      if (totalAvailable < line.quantity) {
        throw new InsufficientStockError(line.productTitle, totalAvailable);
      }

      let remaining = line.quantity;
      for (const row of rows) {
        if (remaining === 0) break;
        const take = Math.min(remaining, row.available);
        if (take <= 0) continue;
        allocations.push({
          inventoryItemId: row.inventoryItemId,
          variantId: row.variantId,
          quantity: take,
        });
        remaining -= take;
      }
    }

    return allocations;
  }

  private toOrderItems(lines: CheckoutLine[], totals: OrderTotals): NewOrderItem[] {
    return totals.lines.map((priced, index) => {
      const source = lines[index];
      return {
        variantId: source.variantId,
        sellerId: source.sellerId,
        // Snapshotted, not joined. An order must still show what was actually
        // bought after the seller renames the product or delists it entirely.
        productTitle: source.productTitle,
        variantName: source.variantName,
        sku: source.sku,
        imageUrl: source.imageUrl,
        unitPriceMinor: source.unitPriceMinor,
        quantity: source.quantity,
        discountMinor: priced.discountMinor,
        taxRatePercent: priced.taxRateApplied,
        taxMinor: priced.taxMinor,
        totalMinor: priced.netMinor,
      };
    });
  }

  /**
   * COD needs no gateway, so the order is confirmed immediately.
   *
   * The reservation is deliberately NOT committed here. Nothing has been paid
   * and the goods are still on the shelf; stock becomes sold at dispatch
   * (Step 9). The rule across both paths is the same — commit the stock when the
   * sale becomes irreversible, which for prepaid is capture and for COD is
   * handing the parcel to the courier.
   */
  private async confirmCashOnDelivery(placed: PlacedOrder): Promise<PlaceOrderResult> {
    const cod = this.gateways.forGateway(PaymentGateway.COD);

    // The COD ceiling lives in the adapter, so the rule is stated once and
    // applies to anything that ever creates a COD payment.
    const intent = await cod.createIntent({
      orderId: placed.order.id,
      orderNumber: placed.order.orderNumber,
      amountMinor: placed.totals.totalMinor,
      currency: placed.totals.currency,
      customerEmail: '',
      idempotencyKey: `cod_${placed.order.id}`,
    });

    await this.transactions.runInTransaction(async (tx) => {
      await this.orders.updateStatus(
        tx,
        placed.order.id,
        OrderStatus.CONFIRMED,
        'Cash on delivery — no payment required up front',
      );
    });

    await this.publishPlaced(placed);

    return this.result(placed, {
      gateway: PaymentGateway.COD,
      method: PaymentMethod.COD,
      gatewayOrderId: intent.gatewayOrderId,
      requiresClientAction: false,
      status: OrderStatus.CONFIRMED,
    });
  }

  /**
   * Opens the payment intent with a healthy gateway.
   *
   * A failure here leaves a committed order with no way to pay for it, so it is
   * compensated immediately rather than left for the sweeper: the order is
   * cancelled and its stock released in one transaction. Waiting fifteen minutes
   * to free inventory because a vendor was briefly down punishes every other
   * shopper for someone else's outage.
   */
  private async openPaymentIntent(
    placed: PlacedOrder,
    input: PlaceOrderInput,
    address: DeliveryAddress,
  ): Promise<PlaceOrderResult> {
    try {
      const gateway = this.gateways.forMethod(input.paymentMethod, input.preferredGateway);

      const intent = await gateway.createIntent({
        orderId: placed.order.id,
        orderNumber: placed.order.orderNumber,
        amountMinor: placed.totals.totalMinor,
        currency: placed.totals.currency,
        customerEmail: input.customerEmail,
        customerPhone: address.phone,
        idempotencyKey: `pay_${placed.order.id}`,
      });

      await this.payments.attachGatewayOrder(placed.paymentId, intent.gatewayOrderId);

      return this.result(placed, {
        gateway: intent.gateway,
        method: input.paymentMethod,
        gatewayOrderId: intent.gatewayOrderId,
        clientToken: intent.clientToken,
        requiresClientAction: intent.requiresClientAction,
        status: OrderStatus.PENDING_PAYMENT,
      });
    } catch (error) {
      this.logger.error(
        `Payment intent failed for order ${placed.order.orderNumber}: ${(error as Error).message}`,
      );
      await this.rollbackPlacedOrder(placed, 'Payment could not be initiated');
      throw error;
    }
  }

  /** Compensating transaction for a committed order that can never be paid. */
  private async rollbackPlacedOrder(placed: PlacedOrder, reason: string): Promise<void> {
    try {
      await this.transactions.runInTransaction(async (tx) => {
        await this.inventory.releaseReservation(tx, placed.order.id);
        await this.orders.cancel(tx, placed.order.id, reason);
      });
    } catch (error) {
      // Swallowed on purpose: the customer must see the original payment error,
      // not a secondary failure they can do nothing about. The sweeper will
      // release the stock on its next pass, which is why it exists.
      this.logger.error(
        `Compensating cancel failed for order ${placed.order.id}; the expiry sweep will release it: ${
          (error as Error).message
        }`,
      );
    }
  }

  private async publishPlaced(placed: PlacedOrder): Promise<void> {
    await this.events.publish(
      new OrderPlacedEvent(
        placed.order.id,
        placed.order.orderNumber,
        placed.order.userId,
        placed.totals.totalMinor,
        placed.totals.currency,
        placed.order.sellerIds,
      ),
    );
  }

  private result(
    placed: PlacedOrder,
    payment: PlaceOrderResult['payment'] & { status: OrderStatus },
  ): PlaceOrderResult {
    const { status, ...rest } = payment;
    return {
      orderId: placed.order.id,
      orderNumber: placed.order.orderNumber,
      status,
      total: toDecimal(placed.totals.totalMinor),
      currency: placed.totals.currency,
      payment: rest,
      idempotentReplay: false,
    };
  }

  /** The response for a retry of a request that already succeeded. */
  private async replay(order: OrderSummary, method: PaymentMethod): Promise<PlaceOrderResult> {
    const payment = await this.payments.findPendingForOrder(order.id);
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: toDecimal(order.totalMinor),
      currency: order.currency,
      payment: {
        gateway: payment?.gateway ?? PaymentGateway.COD,
        method: payment?.method ?? method,
        gatewayOrderId: payment?.gatewayOrderId ?? '',
        requiresClientAction:
          order.status === OrderStatus.PENDING_PAYMENT && method !== PaymentMethod.COD,
      },
      idempotentReplay: true,
    };
  }

  /**
   * Which gateway the payment row is stamped with at insert time.
   *
   * Asked before the transaction commits, so it consults the factory's health
   * view rather than assuming — but the authoritative choice is made by
   * `forMethod` when the intent is opened, and the row is updated if they differ.
   */
  private gatewayNameFor(input: PlaceOrderInput): PaymentGateway {
    if (input.paymentMethod === PaymentMethod.COD) return PaymentGateway.COD;
    return this.gateways.forMethod(input.paymentMethod, input.preferredGateway).name;
  }

  private async requireAddress(userId: string, addressId: string): Promise<DeliveryAddress> {
    const address = await this.addresses.findOwned(userId, addressId);
    if (!address) throw new NotFoundError('Address', addressId);
    return address;
  }
}

interface PlacedOrder {
  order: OrderSummary;
  paymentId: string;
  totals: OrderTotals;
}
