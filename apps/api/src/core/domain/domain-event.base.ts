import { randomUUID } from 'node:crypto';

/**
 * A fact that has already happened. Named in the past tense, always.
 *
 * Events are dispatched only after the transaction commits. Publishing before
 * the commit means a subscriber can send "your order is confirmed" for an order
 * that then rolls back — an email you cannot unsend.
 */
export abstract class DomainEvent {
  readonly eventId: string = randomUUID();
  readonly occurredAt: Date = new Date();

  abstract get eventName(): string;

  /** Correlates the event with the aggregate that raised it. */
  abstract get aggregateId(): string;
}
