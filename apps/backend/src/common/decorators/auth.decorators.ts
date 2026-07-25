import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';
export const ROLES_KEY = 'required_roles';
export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Opts a route out of authentication.
 *
 * Authentication is on by default and switched off explicitly — the reverse
 * (opt-in protection) means one forgotten decorator silently exposes an
 * endpoint, and nothing fails to warn you.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Coarse gate: `@Roles('ADMIN', 'SUPER_ADMIN')`. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Fine-grained gate: `@Permissions('product.delete')`.
 *
 * Preferred over @Roles for anything consequential. Roles change shape as a
 * business grows ("we need a junior admin who can refund but not delete") and
 * permission checks absorb that without a code change.
 */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

/**
 * Injects the verified JWT subject.
 *
 *   findMine(@CurrentUser() user: AuthenticatedUser)
 *
 * Always take identity from here, never from a request body or query parameter.
 * A `userId` in the payload is a claim by the caller; this is a claim verified
 * by signature.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
