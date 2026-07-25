/**
 * Domain errors carry an HTTP status and a stable machine-readable code, but
 * they are thrown from layers that know nothing about HTTP. The exception filter
 * at the edge translates them.
 *
 * The `code` matters more than the message: clients switch on codes, humans read
 * messages, and messages get reworded without warning.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} '${identifier}' was not found` : `${resource} was not found`);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 422;
}

export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly httpStatus = 409;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;

  constructor(message = 'Authentication is required') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly httpStatus = 429;

  constructor(public readonly retryAfterSeconds: number) {
    super('Too many requests. Please slow down.', { retryAfterSeconds });
  }
}

/** A dependency is unavailable and the circuit breaker is refusing calls. */
export class ServiceUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly httpStatus = 503;

  constructor(service: string) {
    super(`${service} is temporarily unavailable. Please try again shortly.`);
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly httpStatus = 409;

  constructor(productTitle: string, available: number) {
    super(
      available > 0
        ? `Only ${available} left of "${productTitle}"`
        : `"${productTitle}" is out of stock`,
      { available },
    );
  }
}

export class PaymentFailedError extends DomainError {
  readonly code = 'PAYMENT_FAILED';
  readonly httpStatus = 402;
}
