import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpirePendingOrdersUseCase } from '../application/use-cases/expire-pending-orders.use-case';

/**
 * The scheduler trigger, and nothing else.
 *
 * All it knows is *when*; the use case knows *what*. Keeping them apart means
 * the expiry logic can be invoked from a test, an admin button or a queue
 * without dragging a cron decorator along — and this class stays too small to
 * hide a bug.
 *
 * Every minute rather than every fifteen: the TTL decides when an order becomes
 * eligible, and a frequent, cheap scan just means stock comes back promptly
 * after that point instead of up to fifteen minutes late.
 *
 * On a multi-pod deployment this runs on every pod. That is safe rather than
 * merely tolerable — `releaseReservation` refuses to settle the same order
 * twice, so concurrent sweeps cannot double-release. A distributed lock would be
 * the next step if the scan itself became expensive.
 */
@Injectable()
export class PendingOrderSweeper {
  private readonly logger = new Logger(PendingOrderSweeper.name);

  constructor(private readonly expireOrders: ExpirePendingOrdersUseCase) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'expire-pending-orders' })
  async sweep(): Promise<void> {
    try {
      await this.expireOrders.execute();
    } catch (error) {
      // A scheduled job that throws takes the scheduler down with it in some
      // runtimes. It is logged and the next tick tries again.
      this.logger.error(`Expiry sweep failed: ${(error as Error).message}`);
    }
  }
}
