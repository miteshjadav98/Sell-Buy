import { DomainEvent } from '../domain/domain-event.base';

/**
 * Observer, at the application boundary.
 *
 * A use case that must also send an email, generate an invoice and reindex the
 * product has stopped being one use case. Publishing a fact and letting
 * subscribers react keeps `PlaceOrderUseCase` about placing orders, and makes
 * "also send a WhatsApp message" a new file rather than an edit to checkout.
 *
 * Publishing happens strictly AFTER the transaction commits. Publish before, and
 * a subscriber sends "your order is confirmed" for an order that then rolls
 * back — an email you cannot unsend.
 */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');

export interface IDomainEventPublisher {
  publish(...events: DomainEvent[]): Promise<void>;
}
