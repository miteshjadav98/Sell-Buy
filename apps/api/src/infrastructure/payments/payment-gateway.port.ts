import { PaymentGateway, PaymentMethod } from '@prisma/client';

/**
 * The contract every payment provider is adapted to.
 *
 * Razorpay talks about "orders", Stripe about "payment intents", COD about
 * nothing at all. The application layer should not know or care. It asks for a
 * payment intent and gets one, whichever provider is behind it — that is
 * Liskov substitution doing real work: no caller ever branches on which
 * implementation it received.
 *
 * Adding a provider means writing one class and registering it. No existing
 * file changes (Open/Closed).
 */
export const PAYMENT_GATEWAY_FACTORY = Symbol('PAYMENT_GATEWAY_FACTORY');

export interface CreateIntentInput {
  orderId: string;
  orderNumber: string;
  /** Minor units (paise/cents) — never floats. */
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerPhone?: string;
  /** Makes the call safe to retry; the provider returns the original result. */
  idempotencyKey: string;
}

export interface PaymentIntent {
  gateway: PaymentGateway;
  /** Provider-side identifier the client SDK needs to open the checkout sheet. */
  gatewayOrderId: string;
  amountMinor: number;
  currency: string;
  /** Publishable key / client secret the browser needs. Never a secret key. */
  clientToken?: string;
  /** True when nothing external is required (COD, fully wallet-paid). */
  requiresClientAction: boolean;
}

export interface VerifyPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface PaymentVerification {
  verified: boolean;
  gatewayPaymentId: string;
  amountMinor: number;
  method?: PaymentMethod;
  failureReason?: string;
}

export interface RefundInput {
  gatewayPaymentId: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  gatewayRefundId: string;
  amountMinor: number;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface IPaymentGateway {
  readonly name: PaymentGateway;

  supports(method: PaymentMethod): boolean;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;

  /**
   * Confirms the payment really happened, by verifying the provider's signature.
   * The client is never trusted to report its own payment as successful — that
   * would be a free-order button.
   */
  verify(input: VerifyPaymentInput): Promise<PaymentVerification>;

  refund(input: RefundInput): Promise<RefundResult>;

  /** Validates a webhook body against its signature header. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
