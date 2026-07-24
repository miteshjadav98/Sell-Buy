import {
  TOPICS,
  type EventBus,
  type EventEnvelope,
  type InventoryRejected,
  type InventoryReserved,
  type Logger,
} from '@sellbuy/common';
import { Order } from '../models/order';

/**
 * Second half of the checkout saga: catalog has ruled on stock, so the order
 * moves out of `pending` and announces its final state.
 */
export function registerInventoryConsumer(bus: EventBus, logger: Logger): Promise<void> {
  return bus.subscribe('order-service', {
    [TOPICS.INVENTORY_RESERVED]: async (event: EventEnvelope<InventoryReserved>) => {
      const { orderId } = event.data;

      // Only a pending order transitions, which makes redelivery harmless.
      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: 'pending' },
        { status: 'confirmed' },
        { new: true },
      );
      if (!order) {
        logger.info('no pending order to confirm', { orderId });
        return;
      }

      await bus.publish(
        TOPICS.ORDER_CONFIRMED,
        {
          orderId: order.id,
          customerId: order.customerId,
          customerEmail: order.customerEmail,
          sellerIds: order.sellerIds,
          total: order.total,
        },
        order.id,
      );
      logger.info('order confirmed', { orderId });
    },

    [TOPICS.INVENTORY_REJECTED]: async (event: EventEnvelope<InventoryRejected>) => {
      const { orderId, reason } = event.data;

      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: 'pending' },
        { status: 'cancelled', statusReason: reason },
        { new: true },
      );
      if (!order) {
        logger.info('no pending order to cancel', { orderId });
        return;
      }

      await bus.publish(
        TOPICS.ORDER_CANCELLED,
        {
          orderId: order.id,
          customerId: order.customerId,
          customerEmail: order.customerEmail,
          reason,
        },
        order.id,
      );
      logger.warn('order cancelled', { orderId, reason });
    },
  });
}
