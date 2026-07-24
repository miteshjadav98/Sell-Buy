/**
 * Unit of Work.
 *
 * Placing an order writes to orders, order_items, inventory, coupons and the
 * cart. Those must all commit or all roll back — an order with no stock
 * reserved, or stock reserved for an order that failed to save, is corruption
 * that support will be untangling by hand for weeks.
 *
 * The port lives in the application layer so use cases can demand atomicity
 * without importing Prisma. The implementation lives in infrastructure.
 */
export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export interface ITransactionManager {
  /**
   * Runs `work` inside a transaction, passing a transactional context that
   * repositories use in place of their default client. Throwing inside `work`
   * rolls everything back.
   */
  runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
}
