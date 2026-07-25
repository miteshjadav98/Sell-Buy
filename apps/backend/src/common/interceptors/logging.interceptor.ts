import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

/**
 * Structured request logging with a correlation id.
 *
 * The id is taken from an inbound `x-correlation-id` when present, so a trace
 * started at the CDN or the web app carries all the way through to the database
 * query log. Debugging a production incident without one means grepping by
 * timestamp and hoping.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /** Fields that must never reach a log file, at any level. */
  private static readonly REDACTED = [
    'password',
    'newPassword',
    'currentPassword',
    'token',
    'refreshToken',
    'accessToken',
    'otp',
    'cardNumber',
    'cvv',
    'signature',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request & { correlationId?: string; user?: { sub: string } }>();
    const response = context.switchToHttp().getResponse<Response>();

    const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response.statusCode, startedAt, correlationId),
        error: () => this.log(request, response.statusCode || 500, startedAt, correlationId),
      }),
    );
  }

  private log(
    request: Request & { user?: { sub: string } },
    status: number,
    startedAt: number,
    correlationId: string,
  ): void {
    const durationMs = Date.now() - startedAt;

    const entry = {
      correlationId,
      method: request.method,
      path: request.url,
      status,
      durationMs,
      userId: request.user?.sub,
      ip: request.ips?.[0] ?? request.ip,
    };

    // Slow requests get flagged rather than blending into the noise —
    // p99 problems are invisible if every line is logged identically.
    if (durationMs > 1_000) {
      this.logger.warn(`SLOW ${JSON.stringify(entry)}`);
    } else {
      this.logger.log(JSON.stringify(entry));
    }
  }

  /** Used by error reporting when a body must be attached to a report. */
  static redact(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of Object.keys(clone)) {
      if (LoggingInterceptor.REDACTED.includes(key)) clone[key] = '[REDACTED]';
    }
    return clone;
  }
}
