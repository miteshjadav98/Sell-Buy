import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EXPIRABLE_STATUSES } from '../domain/checkout.policy';
import { toMinor } from '../domain/pricing/order-totals';
import {
  DeliveryAddress,
  ExpiredOrder,
  IOrderRepository,
  NewOrder,
  OrderSummary,
  TxContext,
} from '../domain/ports/checkout.ports';

const dec = (minor: number): Prisma.Decimal => new Prisma.Decimal(minor / 100);

@Injectable()
export class OrderPrismaRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async create(tx: TxContext, order: NewOrder): Promise<OrderSummary> {
    const created = await this.client(tx).order.create({
      data: {
        orderNumber: order.orderNumber,
        userId: order.userId,
        status: order.status,
        subtotal: dec(order.subtotalMinor),
        discount: dec(order.discountMinor),
        taxAmount: dec(order.taxMinor),
        shippingFee: dec(order.shippingMinor),
        giftWrapFee: dec(order.giftWrapMinor),
        total: dec(order.totalMinor),
        currency: order.currency,
        /**
         * The address is frozen into the order as JSON, not referenced.
         * A customer who later edits or deletes the address must not change
         * where a shipped order says it went — the invoice has to stay
         * reproducible years later, including for a dispute.
         */
        shippingAddress: this.freeze(order.shippingAddress),
        billingAddress: order.billingAddress ? this.freeze(order.billingAddress) : Prisma.DbNull,
        couponCode: order.couponCode,
        customerNote: order.customerNote,
        idempotencyKey: order.idempotencyKey,
        items: {
          create: order.items.map((item) => ({
            variantId: item.variantId,
            sellerId: item.sellerId,
            productTitle: item.productTitle,
            variantName: item.variantName,
            sku: item.sku,
            imageUrl: item.imageUrl,
            unitPrice: dec(item.unitPriceMinor),
            quantity: item.quantity,
            discount: dec(item.discountMinor),
            taxRate: new Prisma.Decimal(item.taxRatePercent),
            taxAmount: dec(item.taxMinor),
            total: dec(item.totalMinor),
          })),
        },
        // The history starts at creation, so an order's timeline is complete
        // from its first state rather than from its first change.
        statusHistory: {
          create: { status: order.status, note: 'Order placed' },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true,
        total: true,
        currency: true,
        items: { select: { sellerId: true } },
      },
    });

    return this.toSummary(created);
  }

  async findByIdempotencyKey(
    userId: string,
    key: string,
    tx?: TxContext,
  ): Promise<OrderSummary | null> {
    const order = await this.client(tx).order.findUnique({
      where: { idempotencyKey: key },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true,
        total: true,
        currency: true,
        items: { select: { sellerId: true } },
      },
    });

    // The key is unique platform-wide, so a match belonging to somebody else is
    // treated as no match — a guessed key must never surface another user's order.
    if (!order || order.userId !== userId) return null;
    return this.toSummary(order);
  }

  async findById(orderId: string, tx?: TxContext): Promise<OrderSummary | null> {
    const order = await this.client(tx).order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true,
        total: true,
        currency: true,
        items: { select: { sellerId: true } },
      },
    });
    return order ? this.toSummary(order) : null;
  }

  async updateStatus(
    tx: TxContext,
    orderId: string,
    status: OrderStatus,
    note?: string,
  ): Promise<void> {
    const client = this.client(tx);

    await client.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === OrderStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
      },
    });

    // Status and history move together, always. A status with no history entry
    // is an order nobody can explain three months later.
    await client.orderStatusHistory.create({
      data: { orderId, status, note: note ?? null },
    });
  }

  async cancel(tx: TxContext, orderId: string, reason: string): Promise<void> {
    const client = this.client(tx);

    await client.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, cancelReason: reason, cancelledAt: new Date() },
    });

    await client.orderStatusHistory.create({
      data: { orderId, status: OrderStatus.CANCELLED, note: reason },
    });
  }

  async findExpired(cutoff: Date, limit: number): Promise<ExpiredOrder[]> {
    return this.prisma.order.findMany({
      where: {
        status: { in: [...EXPIRABLE_STATUSES] },
        placedAt: { lt: cutoff },
      },
      // Oldest first, so a backlog drains in the order it built up.
      orderBy: { placedAt: 'asc' },
      take: limit,
      select: { id: true, orderNumber: true, userId: true },
    });
  }

  /** Prisma's Json input type will not take an interface directly. */
  private freeze(address: DeliveryAddress): Prisma.InputJsonValue {
    return { ...address } as unknown as Prisma.InputJsonValue;
  }

  private toSummary(order: {
    id: string;
    orderNumber: string;
    userId: string;
    status: OrderStatus;
    total: Prisma.Decimal;
    currency: string;
    items: { sellerId: string }[];
  }): OrderSummary {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      totalMinor: toMinor(order.total.toString()),
      currency: order.currency,
      sellerIds: [...new Set(order.items.map((item) => item.sellerId))],
    };
  }
}
