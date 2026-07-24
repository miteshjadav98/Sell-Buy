import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../../../../common/decorators/auth.decorators';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  familyId: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

/**
 * Issues and hashes tokens.
 *
 * Two deliberate asymmetries:
 *
 * 1. The **access token is a signed JWT** carrying roles and permissions, so
 *    guards can authorise without a database round trip on every request. That
 *    is why it is short-lived — a revoked role stops mattering in 15 minutes.
 *
 * 2. The **refresh token is opaque random bytes**, not a JWT. It is checked
 *    against the database on every use, so it can be revoked instantly. Only its
 *    SHA-256 hash is stored: a database leak then yields nothing usable, the
 *    same reasoning that applies to passwords.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(
    user: { id: string; email: string; roles: string[] },
    permissions: string[],
    sessionId: string,
    familyId?: string,
  ): Promise<IssuedTokens> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions,
      sessionId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('auth.accessSecret'),
      // jsonwebtoken types the duration as a template literal union; the value
      // is validated as a duration string by env.validation, so widen it here.
      expiresIn: this.config.get<string>('auth.accessTtl', '15m') as `${number}m`,
    });

    // 256 bits of entropy — not guessable, and never derived from user data.
    const refreshToken = randomBytes(48).toString('base64url');

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      familyId: familyId ?? randomUUID(),
      expiresIn: this.accessTtlSeconds(),
      refreshExpiresAt: new Date(Date.now() + this.refreshTtlMs()),
    };
  }

  /**
   * Plain SHA-256 rather than Argon2. The input is already 256 bits of
   * randomness, so there is nothing to brute-force and no need for a slow
   * KDF — and this runs on every refresh, where latency matters.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSeconds(): number {
    return this.parseDuration(this.config.get<string>('auth.accessTtl', '15m')) / 1_000;
  }

  private refreshTtlMs(): number {
    return this.parseDuration(this.config.get<string>('auth.refreshTtl', '7d'));
  }

  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) throw new Error(`Invalid duration format: ${value}`);
    const amount = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return amount * multipliers[unit];
  }
}
