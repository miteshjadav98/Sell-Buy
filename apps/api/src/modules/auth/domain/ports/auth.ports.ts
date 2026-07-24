import { User } from '../entities/user.entity';

/**
 * Ports — the interfaces the auth feature needs from the outside world.
 *
 * They are declared here, in the layer that *consumes* them, not in the layer
 * that implements them. That is the inversion in Dependency Inversion: the use
 * cases own the contract, and infrastructure conforms to it.
 *
 * Note also Interface Segregation — reads and writes are separate interfaces, so
 * a use case that only looks a user up cannot accidentally modify one, and a
 * test double only has to implement what it is actually asked for.
 */

export const USER_READ_REPOSITORY = Symbol('USER_READ_REPOSITORY');
export const USER_WRITE_REPOSITORY = Symbol('USER_WRITE_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface IUserReadRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;
  getPermissions(userId: string): Promise<string[]>;
}

export interface CreateUserData {
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName?: string;
  phone?: string;
  googleId?: string;
  roleName: string;
}

export interface IUserWriteRepository {
  create(data: CreateUserData): Promise<User>;
  updateLoginState(
    userId: string,
    state: { failedLoginAttempts: number; lockedUntil: Date | null; lastLoginAt?: Date },
  ): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateSessionData {
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

export interface ISessionRepository {
  create(data: CreateSessionData): Promise<SessionRecord>;
  findByTokenHash(hash: string): Promise<SessionRecord | null>;
  /** Marks a session rotated and stores the successor, atomically. */
  rotate(sessionId: string, next: CreateSessionData): Promise<SessionRecord>;
  revoke(sessionId: string): Promise<void>;
  /** Reuse detected — kill every descendant of the compromised login. */
  revokeFamily(familyId: string): Promise<number>;
  revokeAllForUser(userId: string): Promise<number>;
  listActiveForUser(userId: string): Promise<Array<SessionRecord & { deviceName: string | null; lastUsedAt: Date }>>;
}

/**
 * Hashing is a port because the algorithm WILL change. Argon2 today, whatever
 * wins the next password-hashing competition in five years — and that migration
 * should touch one file.
 */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** True when a stored hash uses outdated parameters and should be upgraded. */
  needsRehash(hash: string): boolean;
}
