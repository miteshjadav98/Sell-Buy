import { Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  IInventoryReservationWriter,
  LockedStock,
  StockAllocation,
  TxContext,
} from '../domain/ports/inventory.ports';

/** Reservations are tagged with this so they can be found again by order id. */
const REFERENCE_TYPE = 'ORDER';

/**
 * How a reservation ends. Prisma generates its enums as string-literal unions
 * rather than TypeScript `enum`s, so the members are narrowed with `Extract`
 * rather than referenced as `InventoryMovementType.SALE` in type position.
 */
type SettlementOutcome = Extract<InventoryMovementType, 'SALE' | 'RELEASE'>;

interface LockedRow {
  id: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
}

/**
 * The only code in the system that writes `inventory_items.reserved`.
 *
 * Movement semantics, since the ledger records three different kinds of change:
 *
 * | type        | `quantity` | `quantityAfter`      | effect on the row          |
 * | ----------- | ---------- | -------------------- | -------------------------- |
 * | RESERVATION | −n         | available afterwards | `reserved += n`            |
 * | SALE        | −n         | on-hand afterwards   | `quantity -= n; reserved -= n` |
 * | RELEASE     | +n         | available afterwards | `reserved -= n`            |
 *
 * A SALE leaves availability untouched — those units stopped being sellable the
 * moment they were reserved. All it does is make the shelf figure honest.
 */
@Injectable()
export class InventoryReservationPrismaRepository implements IInventoryReservationWriter {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Repositories accept the opaque handle their port declares and narrow it
   * here — the one place allowed to know the transaction is a Prisma client.
   * Falling back to the pooled client keeps the adapter usable outside a
   * transaction, which the read paths need.
   */
  private client(tx: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async lockForVariants(tx: TxContext, variantIds: string[]): Promise<LockedStock[]> {
    if (variantIds.length === 0) return [];
    const client = this.client(tx);

    /**
     * Raw SQL because Prisma has no `FOR UPDATE`, and the lock is the entire
     * point — an unlocked read lets two concurrent checkouts both see the last
     * unit and both sell it.
     *
     * `ORDER BY id` is not cosmetic: two baskets that overlap on two SKUs would
     * deadlock if each locked them in its own order. A total order over the rows
     * means the second transaction simply waits.
     */
    const rows = await client.$queryRaw<LockedRow[]>`
      SELECT id, "variantId", "warehouseId", quantity, reserved
      FROM inventory_items
      WHERE "variantId" = ANY(${variantIds}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;

    return rows.map((row) => ({
      inventoryItemId: row.id,
      variantId: row.variantId,
      warehouseId: row.warehouseId,
      quantity: row.quantity,
      reserved: row.reserved,
      available: Math.max(0, row.quantity - row.reserved),
    }));
  }

  async reserve(tx: TxContext, orderId: string, allocations: StockAllocation[]): Promise<void> {
    const client = this.client(tx);

    for (const allocation of allocations) {
      const row = await client.inventoryItem.update({
        where: { id: allocation.inventoryItemId },
        data: { reserved: { increment: allocation.quantity } },
        select: { quantity: true, reserved: true },
      });

      await client.inventoryMovement.create({
        data: {
          inventoryItemId: allocation.inventoryItemId,
          type: InventoryMovementType.RESERVATION,
          quantity: -allocation.quantity,
          quantityAfter: Math.max(0, row.quantity - row.reserved),
          referenceType: REFERENCE_TYPE,
          referenceId: orderId,
          note: `Reserved ${allocation.quantity} for order ${orderId}`,
        },
      });
    }
  }

  async commitReservation(tx: TxContext, orderId: string): Promise<number> {
    return this.settle(tx, orderId, InventoryMovementType.SALE);
  }

  async releaseReservation(tx: TxContext, orderId: string): Promise<number> {
    return this.settle(tx, orderId, InventoryMovementType.RELEASE);
  }

  /**
   * Commit and release are the same walk over the same ledger entries, differing
   * only in what they do to the row — so they are one method, and the
   * idempotency guard is written once instead of twice.
   *
   * That guard matters more than it looks: gateways redeliver webhooks
   * aggressively, and the expiry sweeper can race a late capture. Settling
   * twice would either destroy stock that was never sold or hand back units the
   * customer already owns. Finding an existing SALE or RELEASE for the order and
   * returning zero makes both harmless.
   */
  private async settle(
    tx: TxContext,
    orderId: string,
    outcome: SettlementOutcome,
  ): Promise<number> {
    const client = this.client(tx);

    const reservations = await client.inventoryMovement.findMany({
      where: {
        referenceType: REFERENCE_TYPE,
        referenceId: orderId,
        type: InventoryMovementType.RESERVATION,
      },
      select: { inventoryItemId: true, quantity: true },
    });
    if (reservations.length === 0) return 0;

    const alreadySettled = await client.inventoryMovement.count({
      where: {
        referenceType: REFERENCE_TYPE,
        referenceId: orderId,
        type: { in: [InventoryMovementType.SALE, InventoryMovementType.RELEASE] },
      },
    });
    if (alreadySettled > 0) return 0;

    let unitsSettled = 0;

    for (const reservation of reservations) {
      // Reservations are recorded as a negative movement; the units held are its
      // magnitude.
      const units = Math.abs(reservation.quantity);
      unitsSettled += units;

      const row = await client.inventoryItem.update({
        where: { id: reservation.inventoryItemId },
        data:
          outcome === InventoryMovementType.SALE
            ? { quantity: { decrement: units }, reserved: { decrement: units } }
            : { reserved: { decrement: units } },
        select: { quantity: true, reserved: true },
      });

      await client.inventoryMovement.create({
        data: {
          inventoryItemId: reservation.inventoryItemId,
          type: outcome,
          quantity: outcome === InventoryMovementType.SALE ? -units : units,
          quantityAfter:
            outcome === InventoryMovementType.SALE
              ? row.quantity
              : Math.max(0, row.quantity - row.reserved),
          referenceType: REFERENCE_TYPE,
          referenceId: orderId,
          note:
            outcome === InventoryMovementType.SALE
              ? `Sold ${units} against order ${orderId}`
              : `Released ${units} held for order ${orderId}`,
        },
      });
    }

    return unitsSettled;
  }
}
