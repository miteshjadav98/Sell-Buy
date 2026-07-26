import { z } from 'zod';

/**
 * The application refuses to boot on invalid configuration.
 *
 * A missing JWT secret discovered at 3am in production because the first
 * request happened to need it is far worse than a container that never starts.
 * Fail loudly, fail immediately.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * The prefix ONLY — the version segment is appended by `enableVersioning`.
   * Setting this to 'api/v1' produces '/api/v1/v1/…', because both mechanisms
   * apply.
   */
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // --- Data stores ---
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().default(0),

  // --- Auth ---
  // Enforced minimum length: a short secret is a brute-forceable secret.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // --- Payments ---
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- Storage ---
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().default('sell-buy-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),

  // --- Search ---
  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string().optional(),

  // --- Notifications ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('no-reply@sell-buy.com'),
  SMS_API_KEY: z.string().optional(),
  FCM_SERVER_KEY: z.string().optional(),

  // --- Rate limiting ---
  RATE_LIMIT_GLOBAL_POINTS: z.coerce.number().int().default(300),
  RATE_LIMIT_GLOBAL_WINDOW_SEC: z.coerce.number().int().default(60),
  RATE_LIMIT_AUTHENTICATED_POINTS: z.coerce.number().int().default(1000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
