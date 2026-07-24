import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateSessionData,
  ISessionRepository,
  SessionRecord,
} from '../domain/ports/auth.ports';

@Injectable()
export class SessionPrismaRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSessionData): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: {
        userId: data.userId,
        familyId: data.familyId,
        refreshTokenHash: data.refreshTokenHash,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        expiresAt: data.expiresAt,
      },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
      },
    });
  }

  async findByTokenHash(hash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Rotation is one transaction: mark the old token spent and insert its
   * successor together.
   *
   * If these were separate writes and the second failed, the user would be left
   * holding a token already marked as used — and the next refresh would look
   * exactly like token theft, logging them out for no reason.
   */
  async rotate(sessionId: string, next: CreateSessionData): Promise<SessionRecord> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { rotatedAt: new Date(), lastUsedAt: new Date() },
      }),
      this.prisma.session.create({
        data: {
          userId: next.userId,
          familyId: next.familyId,
          refreshTokenHash: next.refreshTokenHash,
          deviceId: next.deviceId,
          deviceName: next.deviceName,
          userAgent: next.userAgent,
          ipAddress: next.ipAddress,
          expiresAt: next.expiresAt,
        },
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          rotatedAt: true,
          revokedAt: true,
        },
      }),
    ]);

    return created;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /** Called on reuse detection — every rotation descended from one login dies. */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Powers the "signed in on these devices" screen. */
  async listActiveForUser(
    userId: string,
  ): Promise<Array<SessionRecord & { deviceName: string | null; lastUsedAt: Date }>> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
        deviceName: true,
        lastUsedAt: true,
      },
    });
  }
}
