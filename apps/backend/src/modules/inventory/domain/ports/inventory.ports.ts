/**
 * Ports for the write side of inventory — the reservation lifecycle.
 *
 * Inventory is its own module because it owns a rule nothing else may bend:
 * `reserved` only ever moves through this code. The cart reads availability, the
 * checkout asks for a reservation, the sweeper asks for a release — none of them
 * touch the columns. One owner is what makes overselling a bug you can fix in
 * one file rather than a property of four modules drifting apart.
 *
 * Every method takes a transaction context because a reservation is worthless
 * outside the transaction that created the order: stock reserved for an order
 * that failed to save, or an order saved with no stock behind it, is corruption
 * that support untangles by hand for weeks.
 */

export const INVENTORY_RESERVATION_WRITER = Symbol('INVENTORY_RESERVATION_WRITER');
export const INVENTORY_AVAILABILITY_READER = Symbol('INVENTORY_AVAILABILITY_READER');

/**
 * The transactional handle, opaque here on purpose. The application layer passes
 * through whatever `ITransactionManager` handed it; only the Prisma adapter
 * knows it is a `Prisma.TransactionClient`.
 */
export type TxContext = unknown;

/** A locked stock row: what is physically held, what is already spoken for. */
export interface LockedStock {
  inventoryItemId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  /** quantity − reserved, floored at zero. */
  available: number;
}

/** One warehouse's share of a line's quantity. */
export interface StockAllocation {
  inventoryItemId: string;
  variantId: string;
  quantity: number;
}

/**
 * The unlocked read: what is free to sell right now, summed across warehouses.
 *
 * Separate from the writer because the callers are different and so are the
 * guarantees. A cart badge reading "2 left" is advisory and must be cheap; a
 * checkout deciding whether to take someone's money must hold a row lock. Two
 * interfaces make it impossible to reach for the cheap one where the expensive
 * one is required.
 */
export interface IInventoryAvailabilityReader {
  available(variantId: string): Promise<number>;
  availableMany(variantIds: string[]): Promise<Map<string, number>>;
}

export interface IInventoryReservationWriter {
  /**
   * Locks every inventory row for these variants with `SELECT … FOR UPDATE` and
   * returns them.
   *
   * Reading availability without the lock is the classic oversell: two checkouts
   * both read "1 available", both pass validation, both reserve. The lock makes
   * the second wait for the first to commit and then see the truth. Rows are
   * locked in a deterministic order so two concurrent checkouts holding
   * overlapping baskets can never deadlock by grabbing them in opposite orders.
   */
  lockForVariants(tx: TxContext, variantIds: string[]): Promise<LockedStock[]>;

  /**
   * Moves units from free to reserved and writes the audit trail entry that
   * later lets the reservation be committed or released by order id.
   */
  reserve(tx: TxContext, orderId: string, allocations: StockAllocation[]): Promise<void>;

  /**
   * Payment captured. Reserved units become sold: `quantity -= n` and
   * `reserved -= n`, so availability is unchanged (it was already spoken for)
   * but the shelf figure finally reflects reality.
   *
   * Idempotent — a webhook redelivered after the first commit is a no-op.
   */
  commitReservation(tx: TxContext, orderId: string): Promise<number>;

  /**
   * Payment failed, order cancelled, or the reservation expired. `reserved -= n`
   * puts the units back on sale.
   *
   * Idempotent for the same reason as commit: gateways retry, sweepers overlap.
   */
  releaseReservation(tx: TxContext, orderId: string): Promise<number>;
}
