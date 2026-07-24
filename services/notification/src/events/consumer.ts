import {
  TOPICS,
  type EventBus,
  type EventEnvelope,
  type Logger,
  type OrderCancelled,
  type OrderConfirmed,
  type OrderCreated,
  type ShopCreated,
  type UserRegistered,
} from '@sellbuy/common';
import { Notification } from '../models/notification';

const money = (amount: number) => `₹${amount.toFixed(2)}`;

/**
 * Notification is a pure subscriber — it has no write API and nothing calls
 * it. Adding a channel (email, SMS, push) means changing this service only,
 * which is the point of publishing facts instead of calling services.
 */
export function registerConsumers(bus: EventBus, logger: Logger): Promise<void> {
  return bus.subscribe('notification-service', {
    [TOPICS.USER_REGISTERED]: async (event: EventEnvelope<UserRegistered>) => {
      const { userId, name, role } = event.data;
      await Notification.create({
        userId,
        type: TOPICS.USER_REGISTERED,
        title: 'Welcome to Sell-Buy',
        message:
          role === 'seller'
            ? `Hi ${name}, create your shop and list your first product to start selling.`
            : `Hi ${name}, browse local shops and place your first order.`,
      });
    },

    [TOPICS.SHOP_CREATED]: async (event: EventEnvelope<ShopCreated>) => {
      const { sellerId, name } = event.data;
      await Notification.create({
        userId: sellerId,
        type: TOPICS.SHOP_CREATED,
        title: 'Shop created',
        message: `"${name}" is live. Add products so customers can buy from you.`,
      });
    },

    [TOPICS.ORDER_CREATED]: async (event: EventEnvelope<OrderCreated>) => {
      const { orderId, customerId, total } = event.data;
      await Notification.create({
        userId: customerId,
        type: TOPICS.ORDER_CREATED,
        title: 'Order placed',
        message: `Order ${orderId.slice(-6)} for ${money(total)} is being processed.`,
      });
    },

    [TOPICS.ORDER_CONFIRMED]: async (event: EventEnvelope<OrderConfirmed>) => {
      const { orderId, customerId, sellerIds, total } = event.data;
      const short = orderId.slice(-6);

      await Notification.create({
        userId: customerId,
        type: TOPICS.ORDER_CONFIRMED,
        title: 'Order confirmed',
        message: `Order ${short} is confirmed. Total ${money(total)}.`,
      });

      // Every seller with a line in the order gets their own notification.
      await Notification.insertMany(
        sellerIds.map((sellerId) => ({
          userId: sellerId,
          type: TOPICS.ORDER_CONFIRMED,
          title: 'New sale',
          message: `You have a new confirmed order (${short}). Check your dashboard.`,
        })),
      );
    },

    [TOPICS.ORDER_CANCELLED]: async (event: EventEnvelope<OrderCancelled>) => {
      const { orderId, customerId, reason } = event.data;
      await Notification.create({
        userId: customerId,
        type: TOPICS.ORDER_CANCELLED,
        title: 'Order cancelled',
        message: `Order ${orderId.slice(-6)} could not be completed: ${reason}`,
      });
      logger.info('cancellation recorded', { orderId });
    },
  });
}
