import { Injectable } from '@nestjs/common';
import { CircuitBreaker, CircuitBreakerMetrics, CircuitBreakerOptions } from './circuit-breaker';

/**
 * One breaker per dependency, created on first use and reused thereafter.
 *
 * Sharing state across every caller is the whole point: if the checkout
 * controller has already discovered Razorpay is down, the retry worker must not
 * have to rediscover it independently.
 *
 * Thresholds differ per dependency because failure profiles differ. A payment
 * gateway is allowed a longer timeout than search, because a slow payment is
 * still worth waiting for whereas a slow search should degrade instantly.
 */
@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  private static readonly PRESETS: Record<string, Omit<CircuitBreakerOptions, 'name'>> = {
    payment: {
      failureThreshold: 5,
      rollingWindowMs: 60_000,
      timeoutMs: 10_000,
      resetTimeoutMs: 30_000,
      halfOpenSuccessThreshold: 2,
      halfOpenMaxAttempts: 2,
    },
    search: {
      failureThreshold: 10,
      rollingWindowMs: 60_000,
      timeoutMs: 3_000, // search must be fast or not at all
      resetTimeoutMs: 20_000,
      halfOpenSuccessThreshold: 3,
      halfOpenMaxAttempts: 3,
    },
    notification: {
      failureThreshold: 5,
      rollingWindowMs: 30_000,
      timeoutMs: 5_000,
      resetTimeoutMs: 60_000,
      halfOpenSuccessThreshold: 2,
      halfOpenMaxAttempts: 1,
    },
    storage: {
      failureThreshold: 5,
      rollingWindowMs: 60_000,
      timeoutMs: 15_000, // uploads are legitimately slow
      resetTimeoutMs: 30_000,
      halfOpenSuccessThreshold: 2,
      halfOpenMaxAttempts: 2,
    },
    ai: {
      failureThreshold: 3,
      rollingWindowMs: 60_000,
      timeoutMs: 15_000,
      resetTimeoutMs: 120_000, // LLM outages tend to be long
      halfOpenSuccessThreshold: 1,
      halfOpenMaxAttempts: 1,
    },
  };

  get(name: string, preset: keyof typeof CircuitBreakerRegistry.PRESETS = 'payment'): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ name, ...CircuitBreakerRegistry.PRESETS[preset] });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /** Surfaced by /health/dependencies so an open circuit is visible, not silent. */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return [...this.breakers.values()].map((b) => b.getMetrics());
  }

  reset(name: string): void {
    this.breakers.get(name)?.reset();
  }
}
