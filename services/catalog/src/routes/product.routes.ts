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

const createProductSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  category: z.string().max(40).default('general'),
  imageUrl: z.string().url().or(z.literal('')).default(''),
});

const updateProductSchema = createProductSchema.partial().extend({
  active: z.boolean().optional(),
});

export function productRoutes(bus: EventBus): Router {
  const router = Router();

  /** Public storefront listing, with optional search and shop filter. */
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { search, shopId, category } = req.query as Record<string, string | undefined>;
      const filter: Record<string, unknown> = { active: true };
      if (shopId) filter.shopId = shopId;
      if (category) filter.category = category;
      if (search) filter.title = { $regex: search, $options: 'i' };

      const products = await Product.find(filter).sort({ createdAt: -1 }).limit(100);
      res.json({ products: products.map((p) => p.toJSON()) });
    }),
  );

  /** Everything the signed-in seller sells, including deactivated items. */
  router.get(
    '/mine',
    requireAuth,
    requireRole('seller'),
    asyncHandler(async (req, res) => {
      const products = await Product.find({ sellerId: req.user!.sub }).sort({ createdAt: -1 });
      res.json({ products: products.map((p) => p.toJSON()) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const product = await Product.findById(req.params.id);
      if (!product) throw new AppError(404, 'Product not found');
      res.json({ product: product.toJSON() });
    }),
  );

  router.post(
    '/',
    requireAuth,
    requireRole('seller'),
    validate(createProductSchema),
    asyncHandler(async (req, res) => {
      const shop = await Shop.findOne({ sellerId: req.user!.sub });
      if (!shop) throw new AppError(400, 'Create your shop before adding products');

      const body = req.body as z.infer<typeof createProductSchema>;
      const product = await Product.create({
        ...body,
        shopId: shop.id,
        shopName: shop.name,
        sellerId: req.user!.sub,
      });

      await bus.publish(
        TOPICS.PRODUCT_CREATED,
        {
          productId: product.id,
          shopId: shop.id,
          sellerId: product.sellerId,
          title: product.title,
          price: product.price,
          stock: product.stock,
        },
        product.id,
      );

      res.status(201).json({ product: product.toJSON() });
    }),
  );

  router.patch(
    '/:id',
    requireAuth,
    requireRole('seller'),
    validate(updateProductSchema),
    asyncHandler(async (req, res) => {
      const product = await Product.findById(req.params.id);
      if (!product) throw new AppError(404, 'Product not found');
      if (product.sellerId !== req.user!.sub) {
        throw new AppError(403, 'You can only edit your own products');
      }

      Object.assign(product, req.body);
      await product.save();
      res.json({ product: product.toJSON() });
    }),
  );

  router.delete(
    '/:id',
    requireAuth,
    requireRole('seller'),
    asyncHandler(async (req, res) => {
      const product = await Product.findById(req.params.id);
      if (!product) throw new AppError(404, 'Product not found');
      if (product.sellerId !== req.user!.sub) {
        throw new AppError(403, 'You can only delete your own products');
      }

      await product.deleteOne();
      res.status(204).send();
    }),
  );

  return router;
}
