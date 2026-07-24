import { Logger } from '@nestjs/common';

const logger = new Logger('Retry');

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Decides whether a given error is worth retrying at all. */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Retry with exponential backoff **and jitter**.
 *
 * The jitter is not decoration. Without it, every client that failed during an
 * outage retries at exactly the same moment — so the dependency comes back up,
 * gets hit by a synchronised wall of traffic, and falls over again. Randomising
 * the delay spreads the load out.
 *
 * Retries are only safe on idempotent operations. Anything that moves money must
 * carry an idempotency key so a retry cannot charge twice.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, isRetryable = defaultIsRetryable } = options;

  let lastError: Error = new Error('Retry called with zero attempts');

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryable(lastError)) throw lastError;
      if (attempt === attempts) break;

      // Full jitter: pick uniformly from [0, exponential ceiling].
      const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delay = Math.floor(Math.random() * ceiling);

      logger.warn(
        `Attempt ${attempt}/${attempts} failed (${lastError.message}) — retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Network faults and 5xx are worth retrying. A 4xx is the server telling you the
 * request itself is wrong — retrying it just wastes everyone's time.
 */
function defaultIsRetryable(error: Error): boolean {
  const status = (error as { status?: number; statusCode?: number }).status
    ?? (error as { statusCode?: number }).statusCode;

  if (typeof status === 'number') {
    return status >= 500 || status === 429;
  }

  const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'timed out'];
  return transient.some((code) => error.message.includes(code));
}
