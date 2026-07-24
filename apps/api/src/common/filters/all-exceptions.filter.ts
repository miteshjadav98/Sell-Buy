import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { DomainError, RateLimitError } from '../errors/domain.errors';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId: string;
    timestamp: string;
    path: string;
  };
}

/**
 * One place that turns anything thrown into an HTTP response.
 *
 * Two rules it enforces:
 *   1. Clients always get the same envelope, so error handling is written once.
 *   2. Internal details never leak. A Prisma constraint name or a stack trace in
 *      a 500 response is reconnaissance handed to an attacker — those go to the
 *      logs, correlated by id, and the client gets a generic message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const correlationId = request.correlationId ?? 'unknown';
    const { status, code, message, details } = this.translate(exception);

    if (exception instanceof RateLimitError) {
      response.setHeader('Retry-After', exception.retryAfterSeconds);
    }

    // 5xx means we broke something — log the stack. 4xx is the caller's problem
    // and logging every one at error level just buries the real incidents.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${correlationId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${code} [${correlationId}]`);
    }

    const body: ErrorBody = {
      success: false,
      error: {
        code,
        message,
        details,
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    response.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        status: exception.getStatus(),
        code: this.codeForStatus(exception.getStatus()),
        message: Array.isArray(message) ? 'Validation failed' : message,
        details: Array.isArray(message) ? { fields: message } : undefined,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.translatePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end. Please try again.',
    };
  }

  private translatePrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    switch (error.code) {
      case 'P2002': {
        // Report which field collided, but never the raw index name.
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return {
          status: HttpStatus.CONFLICT,
          code: 'DUPLICATE_RESOURCE',
          message: `A record with this ${target} already exists`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested record was not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'INVALID_REFERENCE',
          message: 'Referenced record does not exist',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'A database error occurred',
        };
    }
  }

  private codeForStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'RESOURCE_NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_FAILED',
      429: 'RATE_LIMIT_EXCEEDED',
    };
    return map[status] ?? 'ERROR';
  }
}
