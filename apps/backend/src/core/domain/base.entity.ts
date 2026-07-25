import { DomainEvent } from './domain-event.base';

/**
 * Base for every domain entity.
 *
 * Entities are compared by identity, not by value — two Order objects loaded
 * separately with the same id ARE the same order, even if one is stale.
 *
 * Nothing in this folder imports NestJS, Prisma, or anything else framework
 * shaped. That is what makes business rules testable without a container,
 * a database, or an HTTP request.
 */
export abstract class BaseEntity<TId = string> {
  protected constructor(public readonly id: TId) {}

  private readonly _domainEvents: DomainEvent[] = [];

  /**
   * Records something that happened, for whoever cares to react (Observer).
   * The entity does not know or care who is listening — that decoupling is the
   * entire point: adding "send a WhatsApp on order placed" must not require
   * editing the Order entity.
   */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Drained by the use case after a successful commit — never before. */
  pullDomainEvents(): DomainEvent[] {
    return this._domainEvents.splice(0, this._domainEvents.length);
  }

  equals(other?: BaseEntity<TId>): boolean {
    if (!other) return false;
    if (this === other) return true;
    return this.id === other.id;
  }
}
