import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { ForbiddenError, UnauthorizedError } from '../../../../common/errors/domain.errors';
import {
  IPasswordHasher,
  ISessionRepository,
  IUserReadRepository,
  IUserWriteRepository,
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  USER_READ_REPOSITORY,
  USER_WRITE_REPOSITORY,
} from '../../domain/ports/auth.ports';
import { AuthTokensDto, LoginDto } from '../dto/auth.dto';
import { TokenService } from '../services/token.service';

export interface LoginInput extends LoginDto {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class LoginUseCase implements IUseCase<LoginInput, AuthTokensDto> {
  private readonly logger = new Logger(LoginUseCase.name);

  /**
   * A real Argon2 hash of a throwaway value.
   *
   * When the email does not exist we still run a verification against this, so
   * a hit and a miss take the same time. Skipping the hash for unknown emails
   * makes the endpoint answer in 2ms instead of 100ms — a timing oracle that
   * lets anyone enumerate your entire user base.
   */
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$3vJ8kZ9qYxL2mN4pQ7rS1tU5vW8xY0zA2bC4dE6fG8h';

  constructor(
    @Inject(USER_READ_REPOSITORY) private readonly users: IUserReadRepository,
    @Inject(USER_WRITE_REPOSITORY) private readonly userWriter: IUserWriteRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<AuthTokensDto> {
    const email = input.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user || !user.hasPassword()) {
      await this.hasher.verify(LoginUseCase.DUMMY_HASH, input.password).catch(() => false);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check the lock BEFORE verifying the password: a locked account must not
    // reveal whether the attacker finally guessed correctly.
    const gate = user.canAuthenticate();
    if (!gate.allowed) {
      if (user.isLocked()) throw new ForbiddenError(gate.reason);
      throw new ForbiddenError(gate.reason);
    }

    const valid = await this.hasher.verify(user.passwordHash!, input.password);

    if (!valid) {
      const { attempts, lockedUntil } = user.registerFailedLogin();
      await this.userWriter.updateLoginState(user.id, {
        failedLoginAttempts: attempts,
        lockedUntil,
      });
      if (lockedUntil) {
        this.logger.warn(`Account ${user.id} locked after ${attempts} failed attempts`);
      }
      // Same message either way — never "wrong password for a valid account".
      throw new UnauthorizedError('Invalid email or password');
    }

    user.registerSuccessfulLogin();
    await this.userWriter.updateLoginState(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    const permissions = await this.users.getPermissions(user.id);
    const issued = await this.tokens.issue(
      { id: user.id, email: user.email, roles: user.roles },
      permissions,
      'pending',
    );

    // A new session per login is what multi-device support means: signing in on
    // a phone must not invalidate the laptop.
    const session = await this.sessions.create({
      userId: user.id,
      familyId: issued.familyId,
      refreshTokenHash: issued.refreshTokenHash,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: issued.refreshExpiresAt,
    });

    const final = await this.tokens.issue(
      { id: user.id, email: user.email, roles: user.roles },
      permissions,
      session.id,
      issued.familyId,
    );
    await this.sessions.rotate(session.id, {
      userId: user.id,
      familyId: issued.familyId,
      refreshTokenHash: final.refreshTokenHash,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: final.refreshExpiresAt,
    });

    return {
      accessToken: final.accessToken,
      refreshToken: final.refreshToken,
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
