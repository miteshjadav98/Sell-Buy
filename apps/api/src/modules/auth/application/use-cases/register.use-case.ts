import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { ConflictError } from '../../../../common/errors/domain.errors';
import {
  IPasswordHasher,
  IUserReadRepository,
  IUserWriteRepository,
  PASSWORD_HASHER,
  USER_READ_REPOSITORY,
  USER_WRITE_REPOSITORY,
} from '../../domain/ports/auth.ports';
import { AuthTokensDto, RegisterAs, RegisterDto } from '../dto/auth.dto';
import { TokenService } from '../services/token.service';
import { SESSION_REPOSITORY, ISessionRepository } from '../../domain/ports/auth.ports';

export interface RegisterInput extends RegisterDto {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Registers an account and signs the user straight in.
 *
 * Single Responsibility in practice: this class creates the account and nothing
 * else. It does not send the welcome email, provision a seller profile, or warm
 * a recommendation profile — those subscribe to the event instead, so adding a
 * fifth side effect never reopens this file.
 */
@Injectable()
export class RegisterUseCase implements IUseCase<RegisterInput, AuthTokensDto> {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    @Inject(USER_READ_REPOSITORY) private readonly users: IUserReadRepository,
    @Inject(USER_WRITE_REPOSITORY) private readonly userWriter: IUserWriteRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RegisterInput): Promise<AuthTokensDto> {
    const email = input.email.toLowerCase().trim();

    if (await this.users.existsByEmail(email)) {
      // Registration is one of the few places an "already exists" message is
      // unavoidable — the user genuinely needs to know. Login and password
      // reset stay deliberately vague.
      throw new ConflictError('An account with this email already exists. Try signing in.');
    }

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.userWriter.create({
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim(),
      phone: input.phone,
      roleName: input.registerAs === RegisterAs.SELLER ? 'SELLER' : 'CUSTOMER',
    });

    const permissions = await this.users.getPermissions(user.id);
    const issued = await this.tokens.issue(
      { id: user.id, email: user.email, roles: user.roles },
      permissions,
      /* placeholder, replaced below */ 'pending',
    );

    const session = await this.sessions.create({
      userId: user.id,
      familyId: issued.familyId,
      refreshTokenHash: issued.refreshTokenHash,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: issued.refreshExpiresAt,
    });

    // Re-issue the access token now that the session id exists, so the token
    // can be tied back to the exact device that created it.
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
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: final.refreshExpiresAt,
    });

    this.logger.log(`Registered user ${user.id} as ${input.registerAs}`);

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
