import { DomainEvent } from '../../../../core/domain/domain-event.base';

/**
 * The order exists and is paid for (or is COD and therefore confirmed).
 *
 * Everything that is not "place the order" hangs off this: the confirmation
 * email, the invoice PDF, the seller notification, the popularity reindex. None
 * of them belongs inside the checkout transaction — they are slow, they fail for
 * their own reasons, and none of them should be able to fail a purchase.
 *
 * Raised only after the commit. The customer being told about an order that then
 * rolled back is worse than being told late.
 */
export class OrderPlacedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly orderNumber: string,
    public readonly userId: string,
    public readonly totalMinor: number,
    public readonly currency: string,
    public readonly sellerIds: string[],
  ) {
    super();
  }

  get eventName(): string {
    return 'order.placed';
  }

  get aggregateId(): string {
    return this.orderId;
  }
}

/** Payment did not complete. Reserved stock has already been released. */
export class OrderPaymentFailedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly orderNumber: string,
    public readonly userId: string,
    public readonly reason: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'order.payment_failed';
  }

  get aggregateId(): string {
    return this.orderId;
  }
}

/** The reservation window elapsed without payment; the order was cancelled. */
export class OrderExpiredEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly orderNumber: string,
    public readonly userId: string,
  ) {
    super();
  }

  get eventName(): string {
    return 'order.expired';
  }

  get aggregateId(): string {
    return this.orderId;
  }
}
