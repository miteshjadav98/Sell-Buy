import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Singleton Redis connection. Same reasoning as Prisma: one pool per process.
 *
 * Every Redis failure here is caught and logged rather than thrown. Redis is a
 * cache and a rate-limit store — if it goes down the site should get slower,
 * not go offline. The one exception is the rate limiter, which deliberately
 * fails open (documented at its call site).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password'),
      db: this.config.get<number>('redis.db'),
      maxRetriesPerRequest: 3,
      // Exponential backoff, capped — a reconnect storm makes an outage worse.
      retryStrategy: (times) => Math.min(times * 200, 3_000),
      lazyConnect: false,
    });

    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Redis connection established'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  /** Escape hatch for callers that need raw commands (BullMQ, Lua scripts). */
  get raw(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${(err as Error).message}`);
      return null; // a cache miss is always a safe answer
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) await this.client.setex(key, ttlSeconds, payload);
      else await this.client.set(key, payload);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Cache delete failed: ${(err as Error).message}`);
    }
  }

  /**
   * Deletes by pattern using SCAN, never KEYS.
   * `KEYS *` blocks the single-threaded Redis server for the entire scan — on a
   * production keyspace that is a self-inflicted outage.
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await this.client.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Pattern delete failed for ${pattern}: ${(err as Error).message}`);
    }
    return deleted;
  }

  /**
   * Cache-aside with single-flight protection.
   *
   * On a miss, one caller wins a short lock and computes the value; the others
   * wait briefly and re-read. Without this, a popular key expiring sends every
   * concurrent request to the database at once (cache stampede) — the exact
   * moment you least want a thundering herd.
   */
  async remember<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const lockKey = `lock:${key}`;
    const acquired = await this.client.set(lockKey, '1', 'EX', 10, 'NX').catch(() => null);

    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retry = await this.get<T>(key);
      if (retry !== null) return retry;
      return factory(); // lock holder is slow — just compute it
    }

    try {
      const value = await factory();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      await this.del(lockKey);
    }
  }
}
