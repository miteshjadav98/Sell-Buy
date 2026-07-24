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
} from '@sellbuy/common';
import { Product } from '../models/product';
import { Shop } from '../models/shop';

const createShopSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).default(''),
});

export function shopRoutes(bus: EventBus): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const shops = await Shop.find().sort({ createdAt: -1 }).limit(100);
      res.json({ shops: shops.map((s) => s.toJSON()) });
    }),
  );

  /** The signed-in seller's own shop — used by the seller dashboard. */
  router.get(
    '/mine',
    requireAuth,
    requireRole('seller'),
    asyncHandler(async (req, res) => {
      const shop = await Shop.findOne({ sellerId: req.user!.sub });
      res.json({ shop: shop ? shop.toJSON() : null });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const shop = await Shop.findById(req.params.id);
      if (!shop) throw new AppError(404, 'Shop not found');
      const products = await Product.find({ shopId: shop.id, active: true }).sort({ createdAt: -1 });
      res.json({ shop: shop.toJSON(), products: products.map((p) => p.toJSON()) });
    }),
  );

  router.post(
    '/',
    requireAuth,
    requireRole('seller'),
    validate(createShopSchema),
    asyncHandler(async (req, res) => {
      const sellerId = req.user!.sub;
      if (await Shop.exists({ sellerId })) {
        throw new AppError(409, 'You already have a shop');
      }

      const { name, description } = req.body as z.infer<typeof createShopSchema>;
      const shop = await Shop.create({
        sellerId,
        sellerName: req.user!.name,
        name,
        description,
      });

      await bus.publish(
        TOPICS.SHOP_CREATED,
        { shopId: shop.id, sellerId, name: shop.name },
        shop.id,
      );

      res.status(201).json({ shop: shop.toJSON() });
    }),
  );

  return router;
}
