import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the window frees up. */
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Distributed sliding-window rate limiter.
 *
 * Two decisions worth spelling out:
 *
 * 1. **Redis, not in-memory.** With N API pods, a per-process counter means the
 *    real limit is N × the configured one, and it changes every time the HPA
 *    scales. Only a shared store gives a limit that means anything.
 *
 * 2. **Sliding window, not fixed.** A fixed window resets on the clock, so a
 *    "60 per minute" limit permits 120 requests across the boundary at 11:59:59
 *    and 12:00:00 — precisely when an attacker will aim. A sliding window counts
 *    the trailing N seconds from *now*, with no boundary to exploit.
 *
 * The check-and-increment runs as a Lua script so it is atomic. Doing it as
 * separate GET/INCR round trips leaves a race that concurrent requests slip
 * through — which is exactly the traffic shape a limiter is supposed to stop.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  /**
   * Sorted set per key, scored by timestamp:
   *   1. drop entries older than the window
   *   2. count what remains
   *   3. if under budget, add this request
   *   4. re-apply the TTL so idle keys expire on their own
   */
  private static readonly SLIDING_WINDOW_SCRIPT = `
    local key           = KEYS[1]
    local now           = tonumber(ARGV[1])
    local window_ms     = tonumber(ARGV[2])
    local limit         = tonumber(ARGV[3])
    local request_id    = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)

    local current = redis.call('ZCARD', key)

    if current < limit then
      redis.call('ZADD', key, now, request_id)
      redis.call('PEXPIRE', key, window_ms)
      return {1, limit - current - 1, 0}
    end

    -- Rejected: report when the oldest entry ages out so the caller can back off
    -- precisely instead of polling blindly.
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = window_ms
    if oldest[2] then
      retry_after_ms = (tonumber(oldest[2]) + window_ms) - now
    end

    redis.call('PEXPIRE', key, window_ms)
    return {0, 0, retry_after_ms}
  `;

  constructor(private readonly redis: RedisService) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1_000;
    const requestId = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const [allowed, remaining, retryAfterMs] = (await this.redis.raw.eval(
        RateLimiterService.SLIDING_WINDOW_SCRIPT,
        1,
        `ratelimit:${key}`,
        now.toString(),
        windowMs.toString(),
        limit.toString(),
        requestId,
      )) as [number, number, number];

      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1_000));

      return {
        allowed: allowed === 1,
        limit,
        remaining,
        resetAt: Math.ceil((now + (allowed === 1 ? windowMs : retryAfterMs)) / 1_000),
        retryAfterSeconds: allowed === 1 ? 0 : retryAfterSeconds,
      };
    } catch (error) {
      // Fail OPEN, deliberately.
      //
      // If Redis is unreachable, rejecting every request would turn a cache
      // outage into a full site outage — the limiter would cause exactly the
      // downtime it exists to prevent. Serving unthrottled traffic is the lesser
      // evil, and it is loud in the logs so nobody discovers it months later.
      this.logger.error(
        `Rate limiter unavailable, failing open for key ${key}: ${(error as Error).message}`,
      );
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt: Math.ceil((now + windowMs) / 1_000),
        retryAfterSeconds: 0,
      };
    }
  }

  /** Clears a bucket — used after a successful login so one typo does not linger. */
  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`);
  }
}
