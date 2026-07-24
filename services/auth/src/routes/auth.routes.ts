import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import {
  AppError,
  TOPICS,
  asyncHandler,
  requireAuth,
  signToken,
  validate,
  type EventBus,
} from '@sellbuy/common';
import { User } from '../models/user';

const registerSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(6).max(72),
  role: z.enum(['customer', 'seller']).default('customer'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRoutes(bus: EventBus): Router {
  const router = Router();

  router.post(
    '/register',
    validate(registerSchema),
    asyncHandler(async (req, res) => {
      const { name, email, password, role } = req.body as z.infer<typeof registerSchema>;

      if (await User.exists({ email })) {
        throw new AppError(409, 'An account with that email already exists');
      }

      const user = await User.create({
        name,
        email,
        role,
        passwordHash: await bcrypt.hash(password, 10),
      });

      // Fire-and-forget: other services learn about the new user from the bus.
      await bus.publish(
        TOPICS.USER_REGISTERED,
        { userId: user.id, email: user.email, name: user.name, role: user.role },
        user.id,
      );

      const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
      res.status(201).json({ token, user: user.toJSON() });
    }),
  );

  router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      const user = await User.findOne({ email });
      // Same message either way so the endpoint doesn't confirm which emails exist.
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new AppError(401, 'Invalid email or password');
      }

      const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
      res.json({ token, user: user.toJSON() });
    }),
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await User.findById(req.user!.sub);
      if (!user) throw new AppError(404, 'User not found');
      res.json({ user: user.toJSON() });
    }),
  );

  return router;
}
