import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway, PaymentMethod } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentFailedError } from '../../../common/errors/domain.errors';
import { CircuitBreakerRegistry } from '../../resilience/circuit-breaker.registry';
import { retryWithBackoff } from '../../resilience/retry';
import {
  CreateIntentInput,
  IPaymentGateway,
  PaymentIntent,
  PaymentVerification,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
} from '../payment-gateway.port';

/**
 * Adapter for Stripe.
 *
 * Worth comparing against RazorpayAdapter: Stripe is form-encoded not JSON,
 * calls the object a PaymentIntent not an order, returns a `client_secret`
 * rather than a publishable key, and signs webhooks as `t=...,v1=...` with a
 * timestamp. None of those differences escape this file — both classes satisfy
 * the identical interface, which is exactly the point of the pattern.
 */
@Injectable()
export class StripeAdapter implements IPaymentGateway {
  readonly name = PaymentGateway.STRIPE;
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly baseUrl = 'https://api.stripe.com/v1';

  constructor(
    private readonly config: ConfigService,
    private readonly breakers: CircuitBreakerRegistry,
  ) {}

  private static readonly SUPPORTED: PaymentMethod[] = [PaymentMethod.CARD, PaymentMethod.WALLET];

  supports(method: PaymentMethod): boolean {
    return StripeAdapter.SUPPORTED.includes(method);
  }

  private get secretKey(): string {
    return this.config.getOrThrow<string>('payment.stripe.secretKey');
  }

  private async call<T>(
    path: string,
    body: Record<string, string | number>,
    idempotencyKey?: string,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<T> {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) form.append(key, String(value));

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: method === 'POST' ? form.toString() : undefined,
    });

    const parsed = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      const error = new Error(
        parsed?.error?.message ?? `Stripe responded ${response.status}`,
      ) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    return parsed as T;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const breaker = this.breakers.get('stripe', 'payment');

    const intent = await breaker.execute(() =>
      retryWithBackoff(
        () =>
          this.call<{ id: string; amount: number; currency: string; client_secret: string }>(
            '/payment_intents',
            {
              amount: input.amountMinor,
              currency: input.currency.toLowerCase(),
              'automatic_payment_methods[enabled]': 'true',
              receipt_email: input.customerEmail,
              'metadata[orderId]': input.orderId,
              'metadata[orderNumber]': input.orderNumber,
            },
            input.idempotencyKey,
          ),
        { attempts: 3, baseDelayMs: 200, maxDelayMs: 2_000 },
      ),
    );

    return {
      gateway: this.name,
      gatewayOrderId: intent.id,
      amountMinor: intent.amount,
      currency: intent.currency.toUpperCase(),
      clientToken: intent.client_secret,
      requiresClientAction: true,
    };
  }

  async verify(input: VerifyPaymentInput): Promise<PaymentVerification> {
    const breaker = this.breakers.get('stripe', 'payment');

    // Stripe has no per-payment signature to check — the intent's server-side
    // status is the source of truth, so we always ask Stripe directly.
    const intent = await breaker.execute(() =>
      this.call<{ id: string; amount_received: number; status: string }>(
        `/payment_intents/${input.gatewayOrderId}`,
        {},
        undefined,
        'GET',
      ),
    );

    const succeeded = intent.status === 'succeeded';

    return {
      verified: succeeded,
      gatewayPaymentId: intent.id,
      amountMinor: intent.amount_received,
      method: PaymentMethod.CARD,
      failureReason: succeeded ? undefined : `Payment intent status is ${intent.status}`,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const breaker = this.breakers.get('stripe', 'payment');

    try {
      const refund = await breaker.execute(() =>
        this.call<{ id: string; amount: number; status: string }>(
          '/refunds',
          {
            payment_intent: input.gatewayPaymentId,
            amount: input.amountMinor,
            'metadata[reason]': input.reason,
          },
          input.idempotencyKey,
        ),
      );

      return {
        gatewayRefundId: refund.id,
        amountMinor: refund.amount,
        status: refund.status === 'succeeded' ? 'COMPLETED' : 'PROCESSING',
      };
    } catch (error) {
      this.logger.error(`Refund failed for ${input.gatewayPaymentId}: ${(error as Error).message}`);
      throw new PaymentFailedError(`Refund could not be processed: ${(error as Error).message}`);
    }
  }

  /**
   * Stripe signs `timestamp.payload`. The timestamp is checked against a
   * tolerance so a captured webhook cannot be replayed days later.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    const secret = this.config.get<string>('payment.stripe.webhookSecret');
    if (!secret) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => part.split('=') as [string, string]),
    );
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (ageSeconds > 300) {
      this.logger.warn('Rejected webhook: timestamp outside 5-minute tolerance');
      return false;
    }

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
