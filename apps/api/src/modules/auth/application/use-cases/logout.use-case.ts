import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { ISessionRepository, SESSION_REPOSITORY } from '../../domain/ports/auth.ports';
import { TokenService } from '../services/token.service';

export interface LogoutInput {
  refreshToken?: string;
  userId: string;
  /** true = every device, false = just this one. */
  allDevices: boolean;
}

export interface LogoutResult {
  sessionsRevoked: number;
}

/**
 * Logout, single device or everywhere.
 *
 * "Log out from all devices" is a security control, not a convenience: it is
 * what a user reaches for after losing a phone or suspecting a compromise, so it
 * must revoke server-side state rather than just clearing a cookie.
 *
 * Note what it cannot do: an already-issued access token stays valid until it
 * expires, because verifying it is stateless by design. That window is exactly
 * why access tokens are 15 minutes. Anything shorter than "immediate" that
 * genuinely needs immediacy (a banned seller) gets an explicit status check.
 */
@Injectable()
export class LogoutUseCase implements IUseCase<LogoutInput, LogoutResult> {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LogoutInput): Promise<LogoutResult> {
    if (input.allDevices) {
      const revoked = await this.sessions.revokeAllForUser(input.userId);
      this.logger.log(`Revoked ${revoked} session(s) for user ${input.userId}`);
      return { sessionsRevoked: revoked };
    }

    if (!input.refreshToken) return { sessionsRevoked: 0 };

    const session = await this.sessions.findByTokenHash(
      this.tokens.hashRefreshToken(input.refreshToken),
    );

    // Logging out an unknown token is not an error — the client wanted to be
    // signed out, and it now is. Returning 401 here just confuses clients that
    // are cleaning up after an expired session.
    if (!session) return { sessionsRevoked: 0 };

    await this.sessions.revoke(session.id);
    return { sessionsRevoked: 1 };
  }
}
