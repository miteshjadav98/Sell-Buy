import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  IS_PUBLIC_KEY,
} from '../decorators/auth.decorators';
import { UnauthorizedError } from '../errors/domain.errors';

/**
 * Verifies the access token on every request unless the route is @Public.
 *
 * Registered globally, so protection is the default and exposure is deliberate.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);

    // Public routes still decode a token when one is present: the storefront
    // needs to know who you are to personalise, without requiring a login.
    if (isPublic) {
      if (token) {
        try {
          request.user = await this.verify(token);
        } catch {
          /* anonymous — an invalid token is not an error on a public route */
        }
      }
      return true;
    }

    if (!token) throw new UnauthorizedError('Access token is missing');

    request.user = await this.verify(token);
    return true;
  }

  private async verify(token: string): Promise<AuthenticatedUser> {
    try {
      return await this.jwt.verifyAsync<AuthenticatedUser>(token, {
        secret: this.config.getOrThrow<string>('auth.accessSecret'),
      });
    } catch (error) {
      const expired = (error as Error).name === 'TokenExpiredError';
      // Distinguishing expiry matters: the client should silently refresh on
      // expiry, but send the user to the login screen on a malformed token.
      throw new UnauthorizedError(
        expired ? 'Access token has expired' : 'Access token is invalid',
      );
    }
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7).trim() || null;
  }
}
