import { Router } from 'express';
import { z } from 'zod';
import {
  AppError,
  TOPICS,
  asyncHandler,
  requireAuth,
  requireRole,
  validate,
  type EventBus,
  type OrderItem,
} from '@sellbuy/common';
import { fetchProduct } from '../catalog-client';
import { Order } from '../models/order';

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(100),
      }),
    )
    .min(1),
});

export function orderRoutes(bus: EventBus): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth,
    requireRole('customer'),
    validate(createOrderSchema),
    asyncHandler(async (req, res) => {
      const { items } = req.body as z.infer<typeof createOrderSchema>;

      const lines: OrderItem[] = [];
      for (const line of items) {
        const product = await fetchProduct(line.productId);
        if (!product.active) throw new AppError(400, `${product.title} is no longer for sale`);
        lines.push({
          productId: product.id,
          shopId: product.shopId,
          sellerId: product.sellerId,
          title: product.title,
          price: product.price,
          quantity: line.quantity,
        });
      }

      const total = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // The order starts pending; catalog decides whether it can be fulfilled
      // and the answer comes back as an event.
      const order = await Order.create({
        customerId: req.user!.sub,
        customerEmail: req.user!.email,
        items: lines,
        sellerIds: [...new Set(lines.map((i) => i.sellerId))],
        total,
        status: 'pending',
      });

      await bus.publish(
        TOPICS.ORDER_CREATED,
        {
          orderId: order.id,
          customerId: order.customerId,
          customerEmail: order.customerEmail,
          items: lines,
          total,
        },
        order.id,
      );

      res.status(201).json({ order: order.toJSON() });
    }),
  );

  /** Orders the signed-in customer placed. */
  router.get(
    '/mine',
    requireAuth,
    asyncHandler(async (req, res) => {
      const orders = await Order.find({ customerId: req.user!.sub }).sort({ createdAt: -1 });
      res.json({ orders: orders.map((o) => o.toJSON()) });
    }),
  );

  /** Orders that contain at least one of the signed-in seller's products. */
  router.get(
    '/seller',
    requireAuth,
    requireRole('seller'),
    asyncHandler(async (req, res) => {
      const sellerId = req.user!.sub;
      const orders = await Order.find({ sellerIds: sellerId }).sort({ createdAt: -1 });

      // A seller sees only their own lines, and a total recomputed from them.
      const scoped = orders.map((order) => {
        const own = order.items.filter((item) => item.sellerId === sellerId);
        return {
          ...order.toJSON(),
          items: own,
          total: own.reduce((sum, item) => sum + item.price * item.quantity, 0),
        };
      });

      res.json({ orders: scoped });
    }),
  );

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await Order.findById(req.params.id);
      if (!order) throw new AppError(404, 'Order not found');

      const user = req.user!;
      const isOwner = order.customerId === user.sub;
      const isSeller = order.sellerIds.includes(user.sub);
      if (!isOwner && !isSeller) throw new AppError(403, 'Not your order');

      res.json({ order: order.toJSON() });
    }),
  );

  return router;
}
