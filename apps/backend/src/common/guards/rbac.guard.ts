import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedUser,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../decorators/auth.decorators';
import { ForbiddenError, UnauthorizedError } from '../errors/domain.errors';

/**
 * Role- and permission-based access control.
 *
 * Runs after JwtAuthGuard, so `request.user` is already verified. Roles and
 * permissions come from the signed token, which is why tokens are kept short —
 * a revoked permission stops applying within 15 minutes, and immediately on
 * refresh.
 *
 * This guard answers "may this kind of user call this endpoint at all?".
 * It cannot answer "does this user own THIS record" — that check needs the
 * record, so it lives in the use case. Conflating the two is how horizontal
 * privilege escalation bugs happen.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new UnauthorizedError();

    // SUPER_ADMIN bypasses permission checks by design — otherwise a
    // misconfigured permission table can lock every administrator out of the
    // very screens needed to fix it.
    if (user.roles.includes('SUPER_ADMIN')) return true;

    if (requiredRoles?.length) {
      const hasRole = requiredRoles.some((role) => user.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenError(`This action requires one of: ${requiredRoles.join(', ')}`);
      }
    }

    if (requiredPermissions?.length) {
      // ALL required permissions, not any — an endpoint that declares two
      // permissions genuinely needs both.
      const missing = requiredPermissions.filter((p) => !user.permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenError(`Missing permission(s): ${missing.join(', ')}`);
      }
    }

    return true;
  }
}
