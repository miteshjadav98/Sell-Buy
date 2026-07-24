import {
  TOPICS,
  type EventBus,
  type EventEnvelope,
  type Logger,
  type OrderCreated,
  type OrderItem,
} from '@sellbuy/common';
import { Product } from '../models/product';
import { Reservation } from '../models/reservation';

/**
 * Conditional update: only decrements when enough stock is still there, so two
 * concurrent orders for the last item can't both succeed.
 */
async function takeStock(item: OrderItem): Promise<boolean> {
  const result = await Product.updateOne(
    { _id: item.productId, stock: { $gte: item.quantity } },
    { $inc: { stock: -item.quantity } },
  );
  return result.modifiedCount === 1;
}

async function returnStock(items: OrderItem[]): Promise<void> {
  await Promise.all(
    items.map((item) =>
      Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }),
    ),
  );
}

export function registerOrderConsumer(bus: EventBus, logger: Logger): Promise<void> {
  return bus.subscribe('catalog-service', {
    [TOPICS.ORDER_CREATED]: async (event: EventEnvelope<OrderCreated>) => {
      const { orderId, customerId, items } = event.data;

      // Idempotency guard: a redelivered event must not move stock again.
      const alreadyHandled = await Reservation.findOne({ orderId });
      if (alreadyHandled) {
        logger.info('order already processed, skipping', { orderId });
        return;
      }

      const taken: OrderItem[] = [];
      let failure: string | null = null;

      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product || !product.active) {
          failure = `Product no longer available: ${item.title}`;
          break;
        }
        if (!(await takeStock(item))) {
          failure = `Not enough stock for ${item.title}`;
          break;
        }
        taken.push(item);
      }

      if (failure) {
        // Compensating action for the items already taken in this attempt.
        await returnStock(taken);
        await Reservation.create({ orderId, status: 'rejected', reason: failure });
        await bus.publish(
          TOPICS.INVENTORY_REJECTED,
          { orderId, customerId, reason: failure },
          orderId,
        );
        logger.warn('inventory rejected', { orderId, reason: failure });
        return;
      }

      await Reservation.create({ orderId, status: 'reserved' });
      await bus.publish(TOPICS.INVENTORY_RESERVED, { orderId, customerId, items }, orderId);
      logger.info('inventory reserved', { orderId, itemCount: items.length });
    },
  });
}
