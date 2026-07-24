import cors from 'cors';
import express from 'express';
import {
  EventBus,
  connectMongo,
  createLogger,
  errorHandler,
  notFound,
  port,
} from '@sellbuy/common';
import { registerInventoryConsumer } from './events/inventory-consumer';
import { orderRoutes } from './routes/order.routes';

const SERVICE = 'order-service';
const logger = createLogger(SERVICE);

async function main(): Promise<void> {
  await connectMongo('sellbuy_orders', logger);

  const bus = new EventBus(SERVICE, logger);
  await bus.connect();
  await registerInventoryConsumer(bus, logger);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE }));
  app.use('/api/orders', orderRoutes(bus));
  app.use(notFound);
  app.use(errorHandler(logger));

  const listenPort = port('ORDER_PORT', 4003);
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
