import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ITransactionManager } from '../../core/application/transaction-manager.port';
import { PrismaService } from './prisma.service';

/** The transactional client handed to repositories inside a unit of work. */
export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Unit of Work over Prisma's interactive transactions.
 *
 * Timeouts are deliberate and short. A transaction holds row locks; a checkout
 * that hangs for 30 seconds while waiting on a payment API would block every
 * other buyer of the same SKU. External calls belong OUTSIDE the transaction —
 * commit first, then call the gateway.
 */
@Injectable()
export class PrismaTransactionManager implements ITransactionManager {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(work: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => work(tx), {
      maxWait: 5_000, // queue time before giving up on getting a connection
      timeout: 10_000, // hard ceiling on the transaction itself
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }
}
