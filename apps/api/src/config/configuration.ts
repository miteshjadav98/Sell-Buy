import { registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Configuration is read once, validated once, and exposed as typed namespaces.
 * Nothing outside this folder ever touches `process.env` — that keeps config a
 * dependency you can inject and fake in tests, rather than ambient global state.
 */
const env = () => validateEnv(process.env);

export const appConfig = registerAs('app', () => {
  const e = env();
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    apiPrefix: e.API_PREFIX,
    corsOrigins: e.CORS_ORIGINS.split(',').map((o) => o.trim()),
  };
});

export const databaseConfig = registerAs('database', () => ({
  url: env().DATABASE_URL,
}));

export const redisConfig = registerAs('redis', () => {
  const e = env();
  return {
    host: e.REDIS_HOST,
    port: e.REDIS_PORT,
    password: e.REDIS_PASSWORD,
    db: e.REDIS_DB,
  };
});

export const authConfig = registerAs('auth', () => {
  const e = env();
  return {
    accessSecret: e.JWT_ACCESS_SECRET,
    refreshSecret: e.JWT_REFRESH_SECRET,
    accessTtl: e.JWT_ACCESS_TTL,
    refreshTtl: e.JWT_REFRESH_TTL,
    google: {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      callbackUrl: e.GOOGLE_CALLBACK_URL,
    },
  };
});

export const paymentConfig = registerAs('payment', () => {
  const e = env();
  return {
    razorpay: {
      keyId: e.RAZORPAY_KEY_ID,
      keySecret: e.RAZORPAY_KEY_SECRET,
      webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
    },
    stripe: {
      secretKey: e.STRIPE_SECRET_KEY,
      webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    },
  };
});

export const storageConfig = registerAs('storage', () => {
  const e = env();
  return {
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    bucket: e.S3_BUCKET,
    accessKey: e.S3_ACCESS_KEY,
    secretKey: e.S3_SECRET_KEY,
    cdnBaseUrl: e.CDN_BASE_URL,
  };
});

export const searchConfig = registerAs('search', () => {
  const e = env();
  return { host: e.MEILISEARCH_HOST, apiKey: e.MEILISEARCH_API_KEY };
});

export const rateLimitConfig = registerAs('rateLimit', () => {
  const e = env();
  return {
    globalPoints: e.RATE_LIMIT_GLOBAL_POINTS,
    globalWindowSec: e.RATE_LIMIT_GLOBAL_WINDOW_SEC,
    authenticatedPoints: e.RATE_LIMIT_AUTHENTICATED_POINTS,
  };
});

export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  authConfig,
  paymentConfig,
  storageConfig,
  searchConfig,
  rateLimitConfig,
];
