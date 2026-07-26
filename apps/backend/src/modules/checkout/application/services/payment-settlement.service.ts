import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../../../../core/application/domain-event-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import {
  IInventoryReservationWriter,
  INVENTORY_RESERVATION_WRITER,
} from '../../../inventory/domain/ports/inventory.ports';
import {
  OrderPaymentFailedEvent,
  OrderPlacedEvent,
} from '../../domain/events/order-placed.event';
import {
  IOrderRepository,
  IPaymentRepository,
  ORDER_REPOSITORY,
  PAYMENT_REPOSITORY,
  PaymentRecord,
} from '../../domain/ports/checkout.ports';

/**
 * Settling a payment — the same two outcomes reached from two different places.
 *
 * A capture arrives twice: once when the browser returns from the gateway sheet
 * and once when the gateway's webhook lands, in whichever order the network
 * decides. Both must produce exactly one confirmed order, one stock commitment
 * and one confirmation email. Putting the settlement in one service means the
 * idempotency argument is made once and both callers inherit it, instead of two
 * near-identical handlers drifting until only one of them is correct.
 *
 * Idempotency here rests on three things, all cheap and all necessary:
 *   1. the order is only advanced from PENDING_PAYMENT, so a second call is a no-op;
 *   2. `commitReservation` / `releaseReservation` refuse to settle stock twice;
 *   3. webhook deliveries are deduplicated on (gateway, eventId) before reaching here.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(INVENTORY_RESERVATION_WRITER) private readonly inventory: IInventoryReservationWriter,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: IDomainEventPublisher,
  ) {}

  /**
   * Money received. The order is confirmed and the reserved units become sold.
   *
   * Returns false when there was nothing to do — an already-confirmed order,
   * which is the normal outcome of the second of two racing callers and not an
   * error worth surfacing.
   */
  async capture(
    payment: PaymentRecord,
    input: { gatewayPaymentId: string; signature?: string; raw?: unknown },
  ): Promise<boolean> {
    const settled = await this.transactions.runInTransaction(async (tx) => {
      const order = await this.orders.findById(payment.orderId, tx);
      if (!order) return null;

      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        this.logger.log(
          `Order ${order.orderNumber} is already ${order.status}; capture ignored as a replay`,
        );
        return null;
      }

      await this.payments.markCaptured(tx, payment.id, input);
      await this.orders.updateStatus(tx, order.id, OrderStatus.CONFIRMED, 'Payment captured');
      // Reserved → sold. Availability does not move (those units stopped being
      // sellable at reservation); the on-hand figure finally becomes honest.
      await this.inventory.commitReservation(tx, order.id);

      return order;
    });

    if (!settled) return false;

    // After the commit, never before: a subscriber that emails "your order is
    // confirmed" for an order that then rolled back has sent something
    // unsendable.
    await this.events.publish(
      new OrderPlacedEvent(
        settled.id,
        settled.orderNumber,
        settled.userId,
        settled.totalMinor,
        settled.currency,
        settled.sellerIds,
      ),
    );

    return true;
  }

  /**
   * Payment failed or was abandoned at the gateway. Stock goes back on sale
   * immediately rather than waiting for the sweeper — the units are known to be
   * free the moment the gateway says so.
   *
   * The order is CANCELLED with the reason recorded. The schema has no
   * PAYMENT_FAILED order status (only the *payment* carries FAILED), so the
   * cancel reason is where the distinction lives.
   */
  async fail(payment: PaymentRecord, reason: string, raw?: unknown): Promise<boolean> {
    const failed = await this.transactions.runInTransaction(async (tx) => {
      const order = await this.orders.findById(payment.orderId, tx);
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) return null;

      await this.payments.markFailed(tx, payment.id, { reason, raw });
      await this.inventory.releaseReservation(tx, order.id);
      await this.orders.cancel(tx, order.id, `Payment failed: ${reason}`);

      return order;
    });

    if (!failed) return false;

    await this.events.publish(
      new OrderPaymentFailedEvent(failed.id, failed.orderNumber, failed.userId, reason),
    );

    return true;
  }
}
