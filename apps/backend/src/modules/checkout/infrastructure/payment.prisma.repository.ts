import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { toMinor } from '../domain/pricing/order-totals';
import {
  IPaymentRepository,
  NewPayment,
  PaymentRecord,
  TxContext,
} from '../domain/ports/checkout.ports';

const SELECT = {
  id: true,
  orderId: true,
  gateway: true,
  method: true,
  status: true,
  amount: true,
  gatewayOrderId: true,
  gatewayPaymentId: true,
} satisfies Prisma.PaymentSelect;

type Row = Prisma.PaymentGetPayload<{ select: typeof SELECT }>;

@Injectable()
export class PaymentPrismaRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async create(tx: TxContext, payment: NewPayment): Promise<PaymentRecord> {
    const created = await this.client(tx).payment.create({
      data: {
        orderId: payment.orderId,
        gateway: payment.gateway,
        method: payment.method,
        status: PaymentStatus.PENDING,
        amount: new Prisma.Decimal(payment.amountMinor / 100),
        currency: payment.currency,
        idempotencyKey: payment.idempotencyKey,
      },
      select: SELECT,
    });
    return this.toRecord(created);
  }

  /**
   * Written after the gateway call, which is why it is a separate step and not
   * part of `create`: the intent is opened outside the order transaction, so the
   * id does not exist yet when the payment row is inserted.
   */
  async attachGatewayOrder(paymentId: string, gatewayOrderId: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId },
    });
  }

  async findByGatewayOrderId(gatewayOrderId: string, tx?: TxContext): Promise<PaymentRecord | null> {
    const row = await this.client(tx).payment.findFirst({
      where: { gatewayOrderId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return row ? this.toRecord(row) : null;
  }

  async findPendingForOrder(orderId: string, tx?: TxContext): Promise<PaymentRecord | null> {
    const row = await this.client(tx).payment.findFirst({
      where: { orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return row ? this.toRecord(row) : null;
  }

  async markCaptured(
    tx: TxContext,
    paymentId: string,
    input: { gatewayPaymentId: string; signature?: string; raw?: unknown },
  ): Promise<void> {
    await this.client(tx).payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.CAPTURED,
        gatewayPaymentId: input.gatewayPaymentId,
        gatewaySignature: input.signature ?? null,
        // Kept verbatim. When a customer disputes a charge eight months later,
        // the gateway's own words are the only thing that settles it.
        rawResponse: (input.raw ?? Prisma.DbNull) as Prisma.InputJsonValue,
        authorizedAt: new Date(),
        capturedAt: new Date(),
      },
    });
  }

  async markFailed(
    tx: TxContext,
    paymentId: string,
    input: { reason: string; raw?: unknown },
  ): Promise<void> {
    await this.client(tx).payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: input.reason,
        rawResponse: (input.raw ?? Prisma.DbNull) as Prisma.InputJsonValue,
        failedAt: new Date(),
      },
    });
  }

  private toRecord(row: Row): PaymentRecord {
    return {
      id: row.id,
      orderId: row.orderId,
      gateway: row.gateway,
      method: row.method,
      status: row.status,
      amountMinor: toMinor(row.amount.toString()),
      gatewayOrderId: row.gatewayOrderId,
      gatewayPaymentId: row.gatewayPaymentId,
    };
  }
}
