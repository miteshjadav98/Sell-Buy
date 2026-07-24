import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import type { Logger } from './logger';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Forwards rejected promises from async handlers into Express' error chain. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Validates and replaces req.body with the parsed result. */
export function validate(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }
    req.body = result.data;
    next();
  };
}

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'Route not found'));
}

export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
      return;
    }
    // Duplicate key from a unique index — the common case is a taken email.
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'Resource already exists' });
      return;
    }
    logger.error('unhandled error', { err: err instanceof Error ? err.stack : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  };
}
