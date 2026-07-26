import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IInventoryAvailabilityReader } from '../domain/ports/inventory.ports';

/**
 * Reads sellable stock: on-hand minus reserved, summed across every warehouse a
 * variant lives in. Subtracting `reserved` (units committed to unpaid orders) is
 * what stops two shoppers being promised the same last unit — callers see what
 * is *actually* free to sell, not what physically sits on a shelf.
 *
 * A variant with no inventory rows reads as zero, which is the safe answer:
 * unknown stock is treated as no stock rather than infinite.
 *
 * This read is not locked and can be stale the moment it returns. That is fine
 * for a cart badge or a checkout preview, and NOT fine for the decision to take
 * payment — that path uses `lockForVariants` inside the order transaction.
 */
@Injectable()
export class InventoryAvailabilityPrismaReader implements IInventoryAvailabilityReader {
  constructor(private readonly prisma: PrismaService) {}

  async available(variantId: string): Promise<number> {
    const agg = await this.prisma.inventoryItem.aggregate({
      where: { variantId },
      _sum: { quantity: true, reserved: true },
    });
    return Math.max(0, (agg._sum.quantity ?? 0) - (agg._sum.reserved ?? 0));
  }

  async availableMany(variantIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (variantIds.length === 0) return result;

    // One grouped query for the whole basket rather than N point reads.
    const rows = await this.prisma.inventoryItem.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds } },
      _sum: { quantity: true, reserved: true },
    });

    for (const row of rows) {
      result.set(row.variantId, Math.max(0, (row._sum.quantity ?? 0) - (row._sum.reserved ?? 0)));
    }
    // Variants with no inventory rows never appear above — default them to zero.
    for (const id of variantIds) {
      if (!result.has(id)) result.set(id, 0);
    }
    return result;
  }
}
