import { Controller, Get, Module, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CircuitBreakerRegistry } from '../../infrastructure/resilience/circuit-breaker.registry';

/**
 * Liveness and readiness are different questions and Kubernetes treats them
 * differently — conflating them causes restart loops during a database blip,
 * because the process is perfectly healthy and simply cannot serve yet.
 */
/**
 * Version-neutral, and excluded from the global prefix in `main.ts`.
 *
 * A probe URL is configuration in a Kubernetes manifest, not an API contract a
 * client negotiates. Versioning it would mean `/v1/health/ready` today and a
 * silently broken liveness check the day the API moves to v2 — pods restarting
 * in a loop for a reason nobody connects to a version bump.
 */
@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly breakers: CircuitBreakerRegistry,
  ) {}

  /** Liveness: is the process alive? Failing this restarts the pod. */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /**
   * Readiness: can this pod serve traffic? Failing this removes it from the load
   * balancer without killing it, so it can rejoin once the dependency recovers.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks Postgres and Redis' })
  async ready(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      await this.redis.raw.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    const healthy = Object.values(checks).every((state) => state === 'up');
    return { status: healthy ? 'ok' : 'degraded', checks };
  }

  /**
   * Circuit breaker states. An open circuit is a vendor incident in progress —
   * this is what an alert should fire on, well before customers complain.
   */
  @Public()
  @Get('dependencies')
  @ApiOperation({ summary: 'Circuit breaker state per external dependency' })
  dependencies() {
    return { breakers: this.breakers.getAllMetrics() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
