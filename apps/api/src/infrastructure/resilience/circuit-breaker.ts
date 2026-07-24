import { Logger } from '@nestjs/common';
import { ServiceUnavailableError } from '../../common/errors/domain.errors';

export enum CircuitState {
  /** Normal operation. Calls pass through; outcomes are recorded. */
  CLOSED = 'CLOSED',
  /** Tripped. Calls fail fast without touching the dependency. */
  OPEN = 'OPEN',
  /** Probing. A few trial calls decide whether the dependency recovered. */
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Identifies the dependency in logs and metrics. */
  name: string;
  /** Consecutive-window failures that trip the circuit. */
  failureThreshold: number;
  /** Rolling window (ms) over which failures are counted. */
  rollingWindowMs: number;
  /** Per-call timeout (ms). A slow call counts as a failure. */
  timeoutMs: number;
  /** How long to stay OPEN before probing again (ms). */
  resetTimeoutMs: number;
  /** Successful trial calls required to close again. */
  halfOpenSuccessThreshold: number;
  /** Trial calls allowed concurrently while HALF_OPEN. */
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt?: Date;
  openedAt?: Date;
  nextAttemptAt?: Date;
}

/**
 * Circuit Breaker.
 *
 * The failure mode it exists to prevent: a payment gateway starts taking 30
 * seconds to time out instead of 300ms answering. Request threads pile up
 * waiting, the connection pool drains, and an outage at *one vendor* becomes an
 * outage of the *entire checkout* — including cash-on-delivery orders that never
 * needed the gateway at all.
 *
 * Failing fast is counter-intuitive but correct: when a dependency is down,
 * the fastest possible error is the most useful thing you can return, because it
 * frees the resources everyone else needs and lets a fallback run.
 *
 *   CLOSED ──failures ≥ threshold──▶ OPEN ──after resetTimeout──▶ HALF_OPEN
 *      ▲                                                              │
 *      └──────────── trial calls succeed ─────────────────────────────┘
 *                    (any trial failure ⇒ straight back to OPEN)
 */
export class CircuitBreaker {
  private readonly logger: Logger;

  private state: CircuitState = CircuitState.CLOSED;
  /** Failure timestamps inside the rolling window. */
  private failureTimestamps: number[] = [];
  private halfOpenSuccesses = 0;
  private halfOpenInFlight = 0;
  private openedAt?: number;
  private nextAttemptAt?: number;
  private lastFailureAt?: number;
  private totalSuccesses = 0;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.logger = new Logger(`CircuitBreaker:${options.name}`);
  }

  /**
   * Runs `operation` under the breaker.
   *
   * @param fallback Optional degraded path used when the circuit is open. Search
   *                 falls back to Postgres; recommendations fall back to
   *                 trending. Without a fallback, an open circuit throws
   *                 ServiceUnavailableError.
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (!this.canAttempt()) {
      this.logger.warn(`Circuit OPEN — rejecting call to ${this.options.name}`);
      if (fallback) return fallback();
      throw new ServiceUnavailableError(this.options.name);
    }

    if (this.state === CircuitState.HALF_OPEN) this.halfOpenInFlight++;

    try {
      const result = await this.withTimeout(operation());
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      if (fallback) {
        this.logger.warn(`${this.options.name} failed — running fallback`);
        return fallback();
      }
      throw error;
    } finally {
      if (this.state === CircuitState.HALF_OPEN && this.halfOpenInFlight > 0) {
        this.halfOpenInFlight--;
      }
    }
  }

  /**
   * A call that never returns is worse than one that fails, because it holds a
   * connection forever. Every outbound call gets a deadline.
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${this.options.name} timed out after ${this.options.timeoutMs}ms`)),
        this.options.timeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private canAttempt(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Reset window elapsed? Move to HALF_OPEN and allow a probe through.
        if (this.nextAttemptAt && Date.now() >= this.nextAttemptAt) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // Only a trickle of traffic probes recovery. Letting full load back in
        // would knock over a dependency that is still finding its feet.
        return this.halfOpenInFlight < this.options.halfOpenMaxAttempts;
    }
  }

  private recordSuccess(): void {
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenSuccessThreshold) {
        this.logger.log(`${this.options.name} recovered — closing circuit`);
        this.transitionTo(CircuitState.CLOSED);
      }
      return;
    }

    // A success in CLOSED state clears the slate: the threshold is about
    // sustained failure, not a single blip hours ago.
    this.failureTimestamps = [];
  }

  private recordFailure(error: Error): void {
    const now = Date.now();
    this.lastFailureAt = now;
    this.logger.warn(`${this.options.name} call failed: ${error.message}`);

    if (this.state === CircuitState.HALF_OPEN) {
      // The dependency is still unhealthy. Back off for another full window.
      this.logger.warn(`${this.options.name} still failing — re-opening circuit`);
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    this.failureTimestamps.push(now);
    this.pruneWindow(now);

    if (this.failureTimestamps.length >= this.options.failureThreshold) {
      this.logger.error(
        `${this.options.name} hit ${this.failureTimestamps.length} failures in ` +
          `${this.options.rollingWindowMs}ms — opening circuit`,
      );
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /** Drops failures that aged out, so old incidents cannot trip a healthy service. */
  private pruneWindow(now: number): void {
    const cutoff = now - this.options.rollingWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  private transitionTo(state: CircuitState): void {
    this.state = state;

    switch (state) {
      case CircuitState.OPEN:
        this.openedAt = Date.now();
        this.nextAttemptAt = this.openedAt + this.options.resetTimeoutMs;
        this.halfOpenSuccesses = 0;
        this.halfOpenInFlight = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.logger.log(`${this.options.name} — probing recovery (HALF_OPEN)`);
        this.halfOpenSuccesses = 0;
        this.halfOpenInFlight = 0;
        break;

      case CircuitState.CLOSED:
        this.failureTimestamps = [];
        this.halfOpenSuccesses = 0;
        this.openedAt = undefined;
        this.nextAttemptAt = undefined;
        break;
    }
  }

  /** Exposed on the health endpoint and scraped for alerting. */
  getMetrics(): CircuitBreakerMetrics {
    this.pruneWindow(Date.now());
    return {
      name: this.options.name,
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.totalSuccesses,
      lastFailureAt: this.lastFailureAt ? new Date(this.lastFailureAt) : undefined,
      openedAt: this.openedAt ? new Date(this.openedAt) : undefined,
      nextAttemptAt: this.nextAttemptAt ? new Date(this.nextAttemptAt) : undefined,
    };
  }

  /** Manual override for incident response. */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}
