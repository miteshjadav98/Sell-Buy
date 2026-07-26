import { Injectable, Logger } from '@nestjs/common';
import { IDomainEventPublisher } from '../../core/application/domain-event-publisher.port';
import { DomainEvent } from '../../core/domain/domain-event.base';

type Handler = (event: DomainEvent) => Promise<void> | void;

/**
 * In-process event bus — the seam where BullMQ goes.
 *
 * Handlers registered here run in the publisher's process, which is the right
 * shape for the two subscribers that exist today (both are logging) and the
 * wrong shape for the ones coming: sending email and rendering an invoice PDF
 * are slow, fail independently, and must be retried without re-placing the
 * order. Those belong on a queue.
 *
 * What matters is that the *port* is already correct, so moving to BullMQ
 * replaces this class and touches nothing that publishes. Shipping a
 * placeholder behind the right interface costs one file later; shipping the
 * queue call inlined into the use case costs a refactor.
 *
 * A throwing handler is logged and swallowed. The order is already committed —
 * failing the request because a confirmation email bounced would tell the
 * customer their purchase failed when it did not.
 */
@Injectable()
export class InProcessEventPublisher implements IDomainEventPublisher {
  private readonly logger = new Logger(InProcessEventPublisher.name);
  private readonly handlers = new Map<string, Handler[]>();

  subscribe(eventName: string, handler: Handler): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
  }

  async publish(...events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.logger.log(
        `${event.eventName} raised for ${event.aggregateId} (event ${event.eventId})`,
      );

      for (const handler of this.handlers.get(event.eventName) ?? []) {
        try {
          await handler(event);
        } catch (error) {
          this.logger.error(
            `Handler for ${event.eventName} failed: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }
    }
  }
}
