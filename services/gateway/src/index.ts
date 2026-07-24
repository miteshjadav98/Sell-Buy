import cors from 'cors';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createLogger, port } from '@sellbuy/common';

const SERVICE = 'gateway';
const logger = createLogger(SERVICE);

/**
 * The gateway gives the browser one origin and routes by path prefix. It does
 * not verify tokens — each service does that itself — so it stays a routing
 * concern only and never becomes the single point that has to be trusted.
 */
const ROUTES: Array<{ prefix: string; target: string }> = [
  { prefix: '/api/auth', target: process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001' },
  { prefix: '/api/shops', target: process.env.CATALOG_SERVICE_URL ?? 'http://localhost:4002' },
  { prefix: '/api/products', target: process.env.CATALOG_SERVICE_URL ?? 'http://localhost:4002' },
  { prefix: '/api/orders', target: process.env.ORDER_SERVICE_URL ?? 'http://localhost:4003' },
  {
    prefix: '/api/notifications',
    target: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4004',
  },
];

const app = express();
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, routes: ROUTES.map((r) => r.prefix) });
});

for (const { prefix, target } of ROUTES) {
  app.use(
    prefix,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      // The prefix is stripped by Express before the proxy sees the path, so
      // put it back — services mount their routers on the full path.
      pathRewrite: (path) => `${prefix}${path}`,
      on: {
        error: (err, _req, res) => {
          logger.error('upstream unreachable', { target, err: String(err) });
          if ('writeHead' in res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
          }
          if ('end' in res) res.end(JSON.stringify({ error: 'Service unavailable' }));
        },
      },
    }),
  );
  logger.info('route registered', { prefix, target });
}

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

const listenPort = port('GATEWAY_PORT', 4000);
app.listen(listenPort, () => logger.info('listening', { port: listenPort }));
