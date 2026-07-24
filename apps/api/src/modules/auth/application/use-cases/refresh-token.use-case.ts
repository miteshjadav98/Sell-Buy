import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { UnauthorizedError } from '../../../../common/errors/domain.errors';
import {
  ISessionRepository,
  IUserReadRepository,
  SESSION_REPOSITORY,
  USER_READ_REPOSITORY,
} from '../../domain/ports/auth.ports';
import { AuthTokensDto } from '../dto/auth.dto';
import { TokenService } from '../services/token.service';

export interface RefreshInput {
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Rotating refresh with **reuse detection**.
 *
 * The threat: a refresh token is stolen (leaked log, malicious extension,
 * shared machine). With static refresh tokens the thief simply uses it forever
 * and nothing looks unusual.
 *
 * Rotation makes theft observable. Each token works exactly once and is replaced.
 * So if a token that was already rotated turns up again, there are two holders
 * of the same secret — the legitimate user and an attacker. We cannot tell which
 * one is calling, so we trust neither: the entire family is revoked and both are
 * forced to re-authenticate. The user is inconvenienced once; the attacker is
 * evicted permanently.
 */
@Injectable()
export class RefreshTokenUseCase implements IUseCase<RefreshInput, AuthTokensDto> {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(USER_READ_REPOSITORY) private readonly users: IUserReadRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RefreshInput): Promise<AuthTokensDto> {
    const hash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findByTokenHash(hash);

    if (!session) throw new UnauthorizedError('Invalid refresh token');

    // ---- Reuse detection ----
    if (session.rotatedAt !== null) {
      const killed = await this.sessions.revokeFamily(session.familyId);
      this.logger.error(
        `Refresh token reuse detected for user ${session.userId}. ` +
          `Revoked ${killed} session(s) in family ${session.familyId}.`,
      );
      throw new UnauthorizedError('Session security issue detected. Please sign in again.');
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedError('This session has been revoked. Please sign in again.');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    const user = await this.users.findById(session.userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');

    // Re-check status on every refresh — this is what makes a suspension take
    // effect within the access-token lifetime rather than at the next login.
    const gate = user.canAuthenticate();
    if (!gate.allowed) {
      await this.sessions.revokeFamily(session.familyId);
      throw new UnauthorizedError(gate.reason);
    }

    // Permissions are re-read here, so a role change propagates on refresh
    // instead of waiting for the user to sign out.
    const permissions = await this.users.getPermissions(user.id);
    const issued = await this.tokens.issue(
      { id: user.id, email: user.email, roles: user.roles },
      permissions,
      session.id,
      session.familyId, // stays in the same family across rotations
    );

    const next = await this.sessions.rotate(session.id, {
      userId: user.id,
      familyId: session.familyId,
      refreshTokenHash: issued.refreshTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: issued.refreshExpiresAt,
    });

    const final = await this.tokens.issue(
      { id: user.id, email: user.email, roles: user.roles },
      permissions,
      next.id,
      session.familyId,
    );

    return {
      accessToken: final.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: final.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles,
        isVerified: user.isVerified(),
      },
    };
  }
}
