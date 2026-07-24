import path from 'path';
import dotenv from 'dotenv';

// In local dev every service reads the single .env at the repository root.
// In Docker the values arrive as real environment variables, so a missing
// file here is not an error.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// packages/common/dist -> repository root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret: required('JWT_SECRET', 'super-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017'),
  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((b) => b.trim()),
    enabled: (process.env.KAFKA_ENABLED ?? 'true') !== 'false',
  },
};

/** Reads a port from the environment with a per-service default. */
export function port(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
}
