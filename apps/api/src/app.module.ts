import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { configurations } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RateLimitGuard } from './infrastructure/rate-limit/rate-limit.guard';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { PaymentInfrastructureModule } from './infrastructure/payments/payment-infrastructure.module';
import { AuthModule } from './modules/auth/presentation/auth.module';
import { CartModule } from './modules/cart/presentation/cart.module';
import { CatalogModule } from './modules/catalog/presentation/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { JwtModule } from '@nestjs/jwt';

/**
 * Root composition.
 *
 * The global guard order below is deliberate and is the single most
 * security-relevant detail in this file. NestJS runs APP_GUARD providers in
 * registration order:
 *
 *   1. JwtAuthGuard   — establishes identity (so the limiter can key by user)
 *   2. RateLimitGuard — spends the budget, now that we know who is calling
 *   3. RbacGuard      — authorises the identified, within-budget caller
 *
 * Rate limiting must come after authentication so an authenticated user gets
 * their generous per-user budget instead of sharing an IP bucket with an office
 * full of colleagues — but before authorisation, so a caller cannot burn
 * expensive permission lookups by hammering endpoints they may not use.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configurations,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // --- Infrastructure (all @Global) ---
    PrismaModule,
    RedisModule,
    RateLimitModule,
    PaymentInfrastructureModule,
    JwtModule.register({ global: true }),

    // --- Features ---
    HealthModule,
    AuthModule,
    CatalogModule,
    CartModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    // Interceptors run outermost-first: logging wraps everything so it can time
    // the full request, transform shapes only the successful result.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
