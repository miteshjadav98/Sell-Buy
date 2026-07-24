import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export type RateLimitKeyStrategy =
  /** Per client IP — the default for anonymous traffic. */
  | 'ip'
  /** Per authenticated user — survives NAT and shared IPs. */
  | 'user'
  /**
   * Per IP *and* the identifier in the body (email/phone).
   *
   * This is the one that matters for login and OTP: keyed on IP alone, an
   * attacker rotates proxies to reset the budget; keyed on the account alone,
   * they lock a victim out on purpose. Keying on both raises the cost of
   * credential stuffing without handing anyone a denial-of-service lever.
   */
  | 'ip+identifier';

export interface RateLimitOptions {
  /** Requests permitted per window. */
  points: number;
  /** Window length in seconds. */
  duration: number;
  keyBy?: RateLimitKeyStrategy;
  /** Body field to read for the 'ip+identifier' strategy. */
  identifierField?: string;
}

/**
 * Declares a route's rate-limit policy next to the route itself, so the
 * protection is visible in the same file as the thing being protected.
 *
 *   @RateLimit({ points: 5, duration: 60, keyBy: 'ip+identifier',
 *                identifierField: 'email' })
 *   @Post('login')
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Ready-made policies for the endpoints that get attacked. */
export const RateLimitPresets = {
  LOGIN: { points: 5, duration: 60, keyBy: 'ip+identifier', identifierField: 'email' },
  REGISTER: { points: 3, duration: 300, keyBy: 'ip' },
  OTP_REQUEST: { points: 3, duration: 300, keyBy: 'ip+identifier', identifierField: 'phone' },
  OTP_VERIFY: { points: 5, duration: 300, keyBy: 'ip+identifier', identifierField: 'userId' },
  FORGOT_PASSWORD: { points: 3, duration: 3600, keyBy: 'ip+identifier', identifierField: 'email' },
  PAYMENT: { points: 10, duration: 60, keyBy: 'user' },
  SEARCH: { points: 60, duration: 60, keyBy: 'ip' },
  WRITE_REVIEW: { points: 5, duration: 3600, keyBy: 'user' },
} satisfies Record<string, RateLimitOptions>;
