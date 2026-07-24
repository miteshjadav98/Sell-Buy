import jwt, { type SignOptions } from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import type { UserRole } from './events';
import { AppError } from './http';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Every service verifies the JWT itself — the gateway only routes, it is not
 * a trust boundary, so a service is safe to expose directly.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

/** Attaches the user when a token is present, but never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      /* anonymous request */
    }
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}
