import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  correlationId: string;
  timestamp: string;
}

/**
 * Wraps every successful response in one envelope, matching the error envelope
 * from AllExceptionsFilter. Clients then write response handling exactly once
 * instead of guessing at each endpoint's shape.
 *
 * Handlers that already return `{ items, meta }` get their meta hoisted, so
 * pagination information sits beside the data rather than nested inside it.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { correlationId?: string }>();

    return next.handle().pipe(
      map((payload) => {
        const isPaginated =
          payload !== null &&
          typeof payload === 'object' &&
          'items' in (payload as object) &&
          'meta' in (payload as object);

        const { items, meta } = (payload ?? {}) as { items?: T; meta?: Record<string, unknown> };

        return {
          success: true as const,
          data: isPaginated ? (items as T) : payload,
          ...(isPaginated ? { meta } : {}),
          correlationId: request.correlationId ?? 'unknown',
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
