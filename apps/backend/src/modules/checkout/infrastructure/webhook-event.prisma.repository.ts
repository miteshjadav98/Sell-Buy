import { Injectable, Logger } from '@nestjs/common';
import { PaymentGateway, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IWebhookEventRepository } from '../domain/ports/checkout.ports';

/** Prisma's code for "a unique constraint rejected this insert". */
const UNIQUE_VIOLATION = 'P2002';

/**
 * The webhook deduplication table.
 *
 * The interesting decision is doing this as an INSERT that may fail, rather than
 * a SELECT followed by an INSERT. Read-then-write has a window: two retries of
 * the same event, landing on two pods within a few milliseconds, both read
 * "not seen", both proceed, and the order is captured twice.
 *
 * Letting the unique index on `(gateway, eventId)` be the arbiter closes that
 * window completely, because the database resolves it. A P2002 here is not an
 * error — it is the answer.
 */
@Injectable()
export class WebhookEventPrismaRepository implements IWebhookEventRepository {
  private readonly logger = new Logger(WebhookEventPrismaRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(input: {
    gateway: PaymentGateway;
    eventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          gateway: input.gateway,
          eventId: input.eventId,
          eventType: input.eventType,
          payload: (input.payload ?? Prisma.DbNull) as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        this.logger.log(
          `${input.gateway} redelivered event ${input.eventId}; already recorded, skipping`,
        );
        return false;
      }
      throw error;
    }
  }

  async markProcessed(gateway: PaymentGateway, eventId: string, error?: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { gateway_eventId: { gateway, eventId } },
      data: { processedAt: new Date(), error: error ?? null },
    });
  }
}
