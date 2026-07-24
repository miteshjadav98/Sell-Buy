import cors from 'cors';
import express from 'express';
import {
  EventBus,
  asyncHandler,
  connectMongo,
  createLogger,
  errorHandler,
  notFound,
  port,
  requireAuth,
} from '@sellbuy/common';
import { registerConsumers } from './events/consumer';
import { Notification } from './models/notification';

const SERVICE = 'notification-service';
const logger = createLogger(SERVICE);

async function main(): Promise<void> {
  await connectMongo('sellbuy_notifications', logger);

  const bus = new EventBus(SERVICE, logger);
  await bus.connect();
  await registerConsumers(bus, logger);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));

  app.get(
    '/api/notifications',
    requireAuth,
    asyncHandler(async (req, res) => {
      const notifications = await Notification.find({ userId: req.user!.sub })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json({
        notifications: notifications.map((n) => n.toJSON()),
        unread: notifications.filter((n) => !n.read).length,
      });
    }),
  );

  app.post(
    '/api/notifications/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      await Notification.updateMany({ userId: req.user!.sub, read: false }, { read: true });
      res.json({ ok: true });
    }),
  );

  app.use(notFound);
  app.use(errorHandler(logger));

  const listenPort = port('NOTIFICATION_PORT', 4004);
  const server = app.listen(listenPort, () => logger.info('listening', { port: listenPort }));

  const shutdown = async () => {
    logger.info('shutting down');
    server.close();
    await bus.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('failed to start', { err: String(err) });
  process.exit(1);
});
