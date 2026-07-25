import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../../common/decorators/rate-limit.decorator';
import { RateLimitError } from '../../common/errors/domain.errors';
import { RateLimiterService } from './rate-limiter.service';

interface AuthenticatedRequest extends Request {
  user?: { sub: string };
}

/**
 * Applies the layered limits described in the architecture doc:
 *
 *   1. a global budget every request pays into, and
 *   2. a stricter per-route budget where `@RateLimit(...)` is declared.
 *
 * Both must pass. The global tier stops broad scraping; the route tier stops
 * targeted abuse of the few endpoints worth attacking.
 *
 * Registered globally in AppModule, so a new endpoint is protected by default
 * rather than protected only if the author remembered.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiterService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    // --- Tier 1: global budget, keyed by identity when we have one ---
    const isAuthenticated = Boolean(request.user?.sub);
    const globalKey = isAuthenticated ? `global:user:${request.user!.sub}` : `global:ip:${this.ipOf(request)}`;
    const globalPoints = isAuthenticated
      ? this.config.get<number>('rateLimit.authenticatedPoints', 1000)
      : this.config.get<number>('rateLimit.globalPoints', 300);
    const globalWindow = this.config.get<number>('rateLimit.globalWindowSec', 60);

    const globalResult = await this.limiter.consume(globalKey, globalPoints, globalWindow);
    this.setHeaders(response, globalResult.limit, globalResult.remaining, globalResult.resetAt);

    if (!globalResult.allowed) {
      response.setHeader('Retry-After', globalResult.retryAfterSeconds);
      throw new RateLimitError(globalResult.retryAfterSeconds);
    }

    // --- Tier 2: per-route policy, if one is declared ---
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const routeKey = this.buildRouteKey(context, request, options);
    const routeResult = await this.limiter.consume(routeKey, options.points, options.duration);
    this.setHeaders(response, routeResult.limit, routeResult.remaining, routeResult.resetAt);

    if (!routeResult.allowed) {
      response.setHeader('Retry-After', routeResult.retryAfterSeconds);
      throw new RateLimitError(routeResult.retryAfterSeconds);
    }

    return true;
  }

  private buildRouteKey(
    context: ExecutionContext,
    request: AuthenticatedRequest,
    options: RateLimitOptions,
  ): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    switch (options.keyBy ?? 'ip') {
      case 'user':
        return `${route}:user:${request.user?.sub ?? this.ipOf(request)}`;

      case 'ip+identifier': {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const raw = options.identifierField ? body[options.identifierField] : undefined;
        // Lower-cased so Bob@x.com and bob@x.com share one budget rather than
        // handing out a free extra allowance per capitalisation.
        const identifier = typeof raw === 'string' ? raw.toLowerCase() : 'anonymous';
        return `${route}:ip:${this.ipOf(request)}:id:${identifier}`;
      }

      case 'ip':
      default:
        return `${route}:ip:${this.ipOf(request)}`;
    }
  }

  /**
   * Behind a load balancer, `req.ip` is the balancer. Express populates `req.ips`
   * from X-Forwarded-For only when `trust proxy` is configured — which main.ts
   * does, with a bounded hop count so clients cannot spoof the header.
   */
  private ipOf(request: Request): string {
    return request.ips?.[0] ?? request.ip ?? 'unknown';
  }

  private setHeaders(response: Response, limit: number, remaining: number, resetAt: number): void {
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    response.setHeader('X-RateLimit-Reset', resetAt);
  }
}
