/**
 * The event contract shared by every service.
 *
 * Services never call each other to change state — they publish a fact to a
 * topic and whoever cares subscribes. The order flow is a choreographed saga:
 *
 *   order.created      (order)    -> catalog reserves stock
 *   inventory.reserved (catalog)  -> order confirms
 *   inventory.rejected (catalog)  -> order cancels
 *   order.confirmed / order.cancelled (order) -> notification informs buyer + seller
 */

export const TOPICS = {
  USER_REGISTERED: 'user.registered',
  SHOP_CREATED: 'shop.created',
  PRODUCT_CREATED: 'product.created',
  ORDER_CREATED: 'order.created',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_REJECTED: 'inventory.rejected',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** Every message on the bus is wrapped in this envelope. */
export interface EventEnvelope<T = unknown> {
  id: string;
  type: Topic;
  occurredAt: string;
  data: T;
}

export type UserRole = 'customer' | 'seller';

export interface UserRegistered {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ShopCreated {
  shopId: string;
  sellerId: string;
  name: string;
}

export interface ProductCreated {
  productId: string;
  shopId: string;
  sellerId: string;
  title: string;
  price: number;
  stock: number;
}

export interface OrderItem {
  productId: string;
  shopId: string;
  sellerId: string;
  title: string;
  price: number;
  quantity: number;
}

export interface OrderCreated {
  orderId: string;
  customerId: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
}

export interface InventoryReserved {
  orderId: string;
  customerId: string;
  items: OrderItem[];
}

export interface InventoryRejected {
  orderId: string;
  customerId: string;
  reason: string;
}

export interface OrderConfirmed {
  orderId: string;
  customerId: string;
  customerEmail: string;
  sellerIds: string[];
  total: number;
}

export interface OrderCancelled {
  orderId: string;
  customerId: string;
  customerEmail: string;
  reason: string;
}

/** Maps each topic to the payload it carries, so publish/subscribe stay typed. */
export interface EventMap {
  [TOPICS.USER_REGISTERED]: UserRegistered;
  [TOPICS.SHOP_CREATED]: ShopCreated;
  [TOPICS.PRODUCT_CREATED]: ProductCreated;
  [TOPICS.ORDER_CREATED]: OrderCreated;
  [TOPICS.INVENTORY_RESERVED]: InventoryReserved;
  [TOPICS.INVENTORY_REJECTED]: InventoryRejected;
  [TOPICS.ORDER_CONFIRMED]: OrderConfirmed;
  [TOPICS.ORDER_CANCELLED]: OrderCancelled;
}

export const ALL_TOPICS: Topic[] = Object.values(TOPICS);
