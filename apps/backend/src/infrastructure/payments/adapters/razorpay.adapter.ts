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
 * Adapter — translates Razorpay's REST API into our IPaymentGateway contract.
 *
 * Everything Razorpay-shaped stops at this file's boundary: their field names,
 * their amount conventions, their signature scheme. If we drop Razorpay
 * tomorrow, this is the only file that gets deleted.
 *
 * Every outbound call is wrapped in the shared circuit breaker, so a Razorpay
 * incident degrades checkout to "try another method" instead of hanging threads.
 */
@Injectable()
export class RazorpayAdapter implements IPaymentGateway {
  readonly name = PaymentGateway.RAZORPAY;
  private readonly logger = new Logger(RazorpayAdapter.name);
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(
    private readonly config: ConfigService,
    private readonly breakers: CircuitBreakerRegistry,
  ) {}

  private static readonly SUPPORTED: PaymentMethod[] = [
    PaymentMethod.CARD,
    PaymentMethod.UPI,
    PaymentMethod.NET_BANKING,
    PaymentMethod.WALLET,
    PaymentMethod.EMI,
  ];

  supports(method: PaymentMethod): boolean {
    return RazorpayAdapter.SUPPORTED.includes(method);
  }

  private get keyId(): string {
    return this.config.getOrThrow<string>('payment.razorpay.keyId');
  }

  private get keySecret(): string {
    return this.config.getOrThrow<string>('payment.razorpay.keySecret');
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private async call<T>(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        ...(init.idempotencyKey ? { 'X-Razorpay-Idempotency-Key': init.idempotencyKey } : {}),
        ...init.headers,
      },
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      const message = body?.error?.description ?? `Razorpay responded ${response.status}`;
      const error = new Error(message) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    return body as T;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const breaker = this.breakers.get('razorpay', 'payment');

    const order = await breaker.execute(() =>
      retryWithBackoff(
        () =>
          this.call<{ id: string; amount: number; currency: string }>('/orders', {
            method: 'POST',
            // The idempotency key means a retried network call returns the
            // original order rather than creating a second one.
            idempotencyKey: input.idempotencyKey,
            body: JSON.stringify({
              amount: input.amountMinor,
              currency: input.currency,
              receipt: input.orderNumber,
              notes: { orderId: input.orderId },
            }),
          }),
        { attempts: 3, baseDelayMs: 200, maxDelayMs: 2_000 },
      ),
    );

    return {
      gateway: this.name,
      gatewayOrderId: order.id,
      amountMinor: order.amount,
      currency: order.currency,
      clientToken: this.keyId, // publishable id, safe to send to the browser
      requiresClientAction: true,
    };
  }

  /**
   * Razorpay signs `order_id|payment_id` with the API secret. If our own HMAC
   * matches, the payment is genuine — a client cannot forge it without the
   * secret, which never leaves the server.
   */
  async verify(input: VerifyPaymentInput): Promise<PaymentVerification> {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
      .digest('hex');

    if (!this.safeCompare(expected, input.signature)) {
      this.logger.warn(`Signature mismatch for payment ${input.gatewayPaymentId}`);
      return {
        verified: false,
        gatewayPaymentId: input.gatewayPaymentId,
        amountMinor: 0,
        failureReason: 'Signature verification failed',
      };
    }

    // Signature proves authenticity; we still ask Razorpay for the authoritative
    // amount and status rather than trusting anything the client sent.
    const breaker = this.breakers.get('razorpay', 'payment');
    const payment = await breaker.execute(() =>
      this.call<{ id: string; amount: number; status: string; method: string }>(
        `/payments/${input.gatewayPaymentId}`,
        { method: 'GET' },
      ),
    );

    const captured = payment.status === 'captured' || payment.status === 'authorized';

    return {
      verified: captured,
      gatewayPaymentId: payment.id,
      amountMinor: payment.amount,
      method: this.mapMethod(payment.method),
      failureReason: captured ? undefined : `Payment status is ${payment.status}`,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const breaker = this.breakers.get('razorpay', 'payment');

    try {
      const refund = await breaker.execute(() =>
        this.call<{ id: string; amount: number; status: string }>(
          `/payments/${input.gatewayPaymentId}/refund`,
          {
            method: 'POST',
            idempotencyKey: input.idempotencyKey,
            body: JSON.stringify({
              amount: input.amountMinor,
              notes: { reason: input.reason },
            }),
          },
        ),
      );

      return {
        gatewayRefundId: refund.id,
        amountMinor: refund.amount,
        status: refund.status === 'processed' ? 'COMPLETED' : 'PROCESSING',
      };
    } catch (error) {
      // A failed refund is never swallowed — it is surfaced so it can be retried
      // or worked manually. Silently losing a customer's refund is unacceptable.
      this.logger.error(`Refund failed for ${input.gatewayPaymentId}: ${(error as Error).message}`);
      throw new PaymentFailedError(`Refund could not be processed: ${(error as Error).message}`);
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.config.get<string>('payment.razorpay.webhookSecret');
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return this.safeCompare(expected, signature);
  }

  /** Constant-time compare so response timing cannot leak the expected value. */
  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private mapMethod(method: string): PaymentMethod {
    const map: Record<string, PaymentMethod> = {
      card: PaymentMethod.CARD,
      upi: PaymentMethod.UPI,
      netbanking: PaymentMethod.NET_BANKING,
      wallet: PaymentMethod.WALLET,
      emi: PaymentMethod.EMI,
    };
    return map[method] ?? PaymentMethod.CARD;
  }
}
