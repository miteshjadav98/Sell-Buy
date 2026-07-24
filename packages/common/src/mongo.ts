import mongoose from 'mongoose';
import { config } from './config';
import type { Logger } from './logger';

/**
 * Each service owns its own database on the shared Mongo instance —
 * services never read each other's collections, only their own.
 */
export async function connectMongo(dbName: string, logger: Logger): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { dbName });
  logger.info('mongo connected', { dbName });

  mongoose.connection.on('error', (err) => logger.error('mongo error', { err: String(err) }));
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close();
}

/**
 * Shared `toJSON` options: every API response exposes `id` instead of Mongo's
 * `_id`/`__v`. Pass field names to strip anything the client must never see.
 */
export function jsonOptions(omit: string[] = []) {
  return {
    versionKey: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: (_doc: unknown, ret: any) => {
      ret.id = String(ret._id);
      delete ret._id;
      for (const field of omit) delete ret[field];
      return ret;
    },
  };
}
