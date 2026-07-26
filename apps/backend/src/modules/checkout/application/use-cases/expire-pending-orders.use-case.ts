import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../../../../core/application/domain-event-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  IInventoryReservationWriter,
  INVENTORY_RESERVATION_WRITER,
} from '../../../inventory/domain/ports/inventory.ports';
import { RESERVATION_TTL_MINUTES } from '../../domain/checkout.policy';
import { OrderExpiredEvent } from '../../domain/events/order-placed.event';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports/checkout.ports';

export interface ExpirePendingOrdersResult {
  scanned: number;
  expired: number;
}

/**
 * The sweep that makes "reserve, don't decrement" safe.
 *
 * Reserving stock at checkout is what stops two buyers being sold the same last
 * unit — but a customer who opens the gateway page and wanders off would hold
 * that unit forever. Without this job, every abandoned checkout permanently
 * removes inventory, and a popular SKU shows "out of stock" while sitting in the
 * warehouse.
 *
 * Deliberately conservative:
 *
 * - It only touches orders still in PENDING_PAYMENT. An order the webhook has
 *   already confirmed is untouchable, so a capture landing at minute 14:59 wins
 *   over a sweep at 15:00.
 * - Each order is cancelled and released in its own transaction, so one bad row
 *   cannot block the rest of the batch.
 * - `releaseReservation` is idempotent, so overlapping runs — two pods, or a run
 *   that overtakes its predecessor — cannot hand the same units back twice.
 */
@Injectable()
export class ExpirePendingOrdersUseCase implements IUseCase<void, ExpirePendingOrdersResult> {
  private readonly logger = new Logger(ExpirePendingOrdersUseCase.name);

  /** Bounded so a backlog is worked through over several runs rather than in one long transaction. */
  private static readonly BATCH_SIZE = 100;

  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    @Inject(INVENTORY_RESERVATION_WRITER) private readonly inventory: IInventoryReservationWriter,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: IDomainEventPublisher,
  ) {}

  async execute(): Promise<ExpirePendingOrdersResult> {
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MINUTES * 60_000);
    const candidates = await this.orders.findExpired(cutoff, ExpirePendingOrdersUseCase.BATCH_SIZE);

    let expired = 0;

    for (const order of candidates) {
      try {
        await this.transactions.runInTransaction(async (tx) => {
          await this.inventory.releaseReservation(tx, order.id);
          await this.orders.cancel(
            tx,
            order.id,
            `Payment was not completed within ${RESERVATION_TTL_MINUTES} minutes`,
          );
        });

        await this.events.publish(
          new OrderExpiredEvent(order.id, order.orderNumber, order.userId),
        );
        expired += 1;
      } catch (error) {
        // One stuck order must not stop the others being released. It stays
        // PENDING_PAYMENT and is picked up again next run.
        this.logger.error(
          `Could not expire order ${order.orderNumber}: ${(error as Error).message}`,
        );
      }
    }

    if (expired > 0) {
      this.logger.log(`Released stock held by ${expired} abandoned checkout(s)`);
    }

    return { scanned: candidates.length, expired };
  }
}
