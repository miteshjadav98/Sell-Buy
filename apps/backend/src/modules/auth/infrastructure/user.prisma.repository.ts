import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { User } from '../domain/entities/user.entity';
import {
  CreateUserData,
  IUserReadRepository,
  IUserWriteRepository,
} from '../domain/ports/auth.ports';

/**
 * Repository — the only place in the auth feature that knows Prisma exists.
 *
 * It maps rows to the User entity, so use cases receive an object with business
 * rules on it rather than an anonymous bag of columns. Swapping the ORM, or
 * putting users behind a separate service, changes this file and nothing else.
 */
@Injectable()
export class UserPrismaRepository implements IUserReadRepository, IUserWriteRepository {
  private static readonly PERMISSION_CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    return row ? this.toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Permissions are read on every login and refresh, and change rarely — a
   * textbook cache. The TTL is short and the key is busted explicitly when a
   * role changes, so a revoked permission cannot linger.
   */
  async getPermissions(userId: string): Promise<string[]> {
    return this.redis.remember(
      `permissions:${userId}`,
      UserPrismaRepository.PERMISSION_CACHE_TTL,
      async () => {
        const rows = await this.prisma.userRole.findMany({
          where: { userId },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });

        const codes = rows.flatMap((userRole) =>
          userRole.role.permissions.map((rp) => rp.permission.code),
        );
        return [...new Set(codes)];
      },
    );
  }

  async create(data: CreateUserData): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        googleId: data.googleId,
        // Google accounts arrive with a verified email, so they skip the OTP step.
        status: data.googleId ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: data.googleId ? new Date() : null,
        roles: {
          create: { role: { connect: { name: data.roleName } } },
        },
        // Every customer gets a wallet up front, so refunds never have to
        // create one mid-transaction.
        wallet: { create: {} },
      },
      include: { roles: { include: { role: true } } },
    });

    return this.toDomain(row);
  }

  async updateLoginState(
    userId: string,
    state: { failedLoginAttempts: number; lockedUntil: Date | null; lastLoginAt?: Date },
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: state.failedLoginAttempts,
        lockedUntil: state.lockedUntil,
        ...(state.lastLoginAt ? { lastLoginAt: state.lastLoginAt } : {}),
      },
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), status: UserStatus.ACTIVE },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  /** Invalidate after any role or permission change. */
  async invalidatePermissionCache(userId: string): Promise<void> {
    await this.redis.del(`permissions:${userId}`);
  }

  private toDomain(row: {
    id: string;
    email: string;
    passwordHash: string | null;
    firstName: string;
    lastName: string | null;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    roles: Array<{ role: { name: string } }>;
  }): User {
    return User.hydrate(row.id, {
      email: row.email,
      passwordHash: row.passwordHash,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      emailVerifiedAt: row.emailVerifiedAt,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      roles: row.roles.map((r) => r.role.name),
    });
  }
}
