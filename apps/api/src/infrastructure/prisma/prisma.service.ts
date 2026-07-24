import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton — exactly one PrismaClient, and therefore one connection pool, per
 * process. Constructing a client per request exhausts Postgres connections
 * within minutes under load; this is the classic way a Node service dies.
 *
 * NestJS providers are singletons by default, so the pattern here is really
 * about owning the *lifecycle*: connect on boot, disconnect on shutdown.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Drains the pool on SIGTERM so in-flight queries finish before the pod dies.
   * Without this, a rolling deploy produces a burst of aborted transactions.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Test helper — wipes every table in dependency order.
   * Guarded so it can never run against a real database.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAll() must never run in production');
    }

    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;

    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    if (list) await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE;`);
  }
}
