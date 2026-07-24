import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // The raw body is needed to verify webhook HMAC signatures — once Express
    // has parsed and re-serialised JSON, key order can change and the signature
    // will never match.
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const isProduction = config.get<boolean>('app.isProduction');

  /**
   * Trust exactly one proxy hop (the ingress/load balancer).
   *
   * `trust proxy: true` would trust the entire X-Forwarded-For chain, letting a
   * client prepend any IP it likes — which would let an attacker forge their
   * source address and sidestep every IP-keyed rate limit.
   */
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false, // CSP breaks Swagger UI locally
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true, // required for the refresh cookie
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'Idempotency-Key'],
    exposedHeaders: ['x-correlation-id', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  });

  app.setGlobalPrefix(config.get<string>('app.apiPrefix', 'api/v1'), {
    exclude: ['health/live', 'health/ready', 'health/dependencies'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties with no matching DTO field — the defence against mass
      // assignment (a client sending `"role": "ADMIN"` into a profile update).
      whitelist: true,
      // And rejects them outright, so a typo'd field fails loudly rather than
      // being silently ignored.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Validation messages are suppressed in production: they describe internal
      // field names and constraints that are of more use to an attacker than a user.
      disableErrorMessages: isProduction,
    }),
  );

  app.enableShutdownHooks();

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Sell-Buy Commerce API')
      .setDescription(
        'Multi-vendor commerce platform.\n\n' +
          '**Auth:** short-lived access token in the `Authorization` header; ' +
          'refresh token in an HttpOnly cookie, rotated on every use.\n\n' +
          '**Rate limits:** every response carries `X-RateLimit-*`; a 429 also ' +
          'carries `Retry-After`.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addTag('Authentication')
      .addTag('Health')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger UI available at /api/docs');
  }

  const port = config.get<number>('app.port', 4000);
  await app.listen(port);
  logger.log(`API listening on port ${port} (${config.get('app.nodeEnv')})`);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start application', error);
  process.exit(1);
});
