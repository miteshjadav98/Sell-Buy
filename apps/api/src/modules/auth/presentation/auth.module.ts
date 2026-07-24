import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import {
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  USER_READ_REPOSITORY,
  USER_WRITE_REPOSITORY,
} from '../domain/ports/auth.ports';
import { TokenService } from '../application/services/token.service';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { RegisterUseCase } from '../application/use-cases/register.use-case';
import { Argon2PasswordHasher } from '../infrastructure/argon2-password.hasher';
import { SessionPrismaRepository } from '../infrastructure/session.prisma.repository';
import { UserPrismaRepository } from '../infrastructure/user.prisma.repository';
import { AuthController } from './auth.controller';

/**
 * The composition root for auth — the one file where abstractions meet
 * implementations.
 *
 * Use cases ask for USER_READ_REPOSITORY (an interface they own); this module
 * decides that Prisma answers it. Nothing in `application/` or `domain/` imports
 * a repository class, which is what keeps them testable with a plain fake and
 * no database.
 *
 * Note UserPrismaRepository is bound to two tokens via useExisting: one class,
 * one instance, exposed through two segregated interfaces.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.accessSecret'),
        signOptions: {
          expiresIn: config.get<string>('auth.accessTtl', '15m') as `${number}m`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // --- Use cases ---
    RegisterUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    TokenService,

    // --- Port bindings (Dependency Inversion) ---
    UserPrismaRepository,
    { provide: USER_READ_REPOSITORY, useExisting: UserPrismaRepository },
    { provide: USER_WRITE_REPOSITORY, useExisting: UserPrismaRepository },
    { provide: SESSION_REPOSITORY, useClass: SessionPrismaRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
  ],
  exports: [USER_READ_REPOSITORY, TokenService],
})
export class AuthModule {}
