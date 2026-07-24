/**
 * Explicit success/failure, so expected outcomes are values rather than thrown
 * exceptions.
 *
 * "Coupon expired" is not exceptional — it is a normal business answer. Modelling
 * it as a return type forces the caller to handle it, and the compiler enforces
 * that. Exceptions stay for genuinely exceptional things: the database is gone.
 */
export type Result<T, E = string> = Success<T, E> | Failure<T, E>;

export class Success<T, E> {
  readonly isSuccess = true as const;
  readonly isFailure = false as const;

  constructor(public readonly value: T) {}

  unwrap(): T {
    return this.value;
  }
}

export class Failure<T, E> {
  readonly isSuccess = false as const;
  readonly isFailure = true as const;

  constructor(public readonly error: E) {}

  unwrap(): never {
    throw new Error(`Attempted to unwrap a failed Result: ${String(this.error)}`);
  }
}

export const ok = <T, E = string>(value: T): Result<T, E> => new Success<T, E>(value);
export const fail = <T = never, E = string>(error: E): Result<T, E> => new Failure<T, E>(error);
