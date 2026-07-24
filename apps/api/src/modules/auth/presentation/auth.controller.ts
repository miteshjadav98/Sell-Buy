import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
} from '../../../common/decorators/auth.decorators';
import { RateLimit, RateLimitPresets } from '../../../common/decorators/rate-limit.decorator';
import { UnauthorizedError } from '../../../common/errors/domain.errors';
import {
  AuthTokensDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from '../application/dto/auth.dto';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { RegisterUseCase } from '../application/use-cases/register.use-case';

const REFRESH_COOKIE = 'sb_refresh';

/**
 * Presentation layer: HTTP in, use case out. No business logic lives here.
 *
 * Its one real responsibility beyond routing is cookie handling — deciding
 * *where* a token lives is a transport concern, and it is a security-critical
 * one (see setRefreshCookie).
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Public()
  @Post('register')
  @RateLimit(RateLimitPresets.REGISTER)
  @ApiOperation({ summary: 'Create a customer or seller account' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensDto> {
    const result = await this.registerUseCase.execute({
      ...dto,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ips?.[0] ?? request.ip,
    });

    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.LOGIN)
  @ApiOperation({ summary: 'Sign in and open a session for this device' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account locked, suspended or unverified' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensDto> {
    const result = await this.loginUseCase.execute({
      ...dto,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ips?.[0] ?? request.ip,
    });

    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair (rotates)' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Invalid, expired, revoked, or replayed token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensDto> {
    // Cookie first, body second: browsers use the HttpOnly cookie, while native
    // clients that cannot hold cookies send it explicitly.
    const token = (request.cookies?.[REFRESH_COOKIE] as string) ?? dto.refreshToken;
    if (!token) throw new UnauthorizedError('Refresh token is missing');

    const result = await this.refreshUseCase.execute({
      refreshToken: token,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ips?.[0] ?? request.ip,
    });

    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out of this device only' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ sessionsRevoked: number }> {
    const result = await this.logoutUseCase.execute({
      refreshToken: request.cookies?.[REFRESH_COOKIE],
      userId: user.sub,
      allDevices: false,
    });

    this.clearRefreshCookie(response);
    return result;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out of every device — use after a suspected compromise' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ sessionsRevoked: number }> {
    const result = await this.logoutUseCase.execute({ userId: user.sub, allDevices: true });
    this.clearRefreshCookie(response);
    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user, straight from the verified token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * Refresh token cookie hardening:
   *   httpOnly  — JavaScript cannot read it, so XSS cannot steal it. This is
   *               precisely why the refresh token is NOT in localStorage.
   *   secure    — HTTPS only in production.
   *   sameSite  — 'strict' blocks cross-site sends, which is the CSRF defence.
   *   path      — scoped to the refresh endpoints, so it is not attached to
   *               every request and cannot leak through unrelated handlers.
   */
  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
