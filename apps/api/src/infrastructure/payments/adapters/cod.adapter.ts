import { Injectable } from '@nestjs/common';
import { PaymentGateway, PaymentMethod } from '@prisma/client';
import { BusinessRuleError } from '../../../common/errors/domain.errors';
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
 * Cash on Delivery, expressed as a gateway.
 *
 * There is no external system here, but modelling COD as an IPaymentGateway
 * keeps the checkout use case completely uniform — no `if (method === COD)`
 * branch anywhere in the application layer. The special case is absorbed by a
 * class instead of leaking into business logic.
 *
 * Also a nice property under failure: when the online gateways' circuits are
 * open, COD still works, because it depends on nothing.
 */
@Injectable()
export class CodAdapter implements IPaymentGateway {
  readonly name = PaymentGateway.COD;

  /** COD orders above this are refused — unrecovered COD is a real loss. */
  private static readonly MAX_COD_AMOUNT_MINOR = 5_000_000; // ₹50,000

  supports(method: PaymentMethod): boolean {
    return method === PaymentMethod.COD;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (input.amountMinor > CodAdapter.MAX_COD_AMOUNT_MINOR) {
      throw new BusinessRuleError(
        'Cash on Delivery is not available for orders above ₹50,000. Please pay online.',
      );
    }

    return {
      gateway: this.name,
      gatewayOrderId: `cod_${input.orderId}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      // Nothing for the browser to do — the order is confirmed immediately.
      requiresClientAction: false,
    };
  }

  async verify(input: VerifyPaymentInput): Promise<PaymentVerification> {
    // Collection is confirmed by the delivery partner, not by this API.
    return { verified: true, gatewayPaymentId: input.gatewayOrderId, amountMinor: 0 };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Money never reached us, so there is nothing to send back through a
    // gateway. The orders module credits the customer's wallet instead.
    return {
      gatewayRefundId: `cod_refund_${input.gatewayPaymentId}`,
      amountMinor: input.amountMinor,
      status: 'COMPLETED',
    };
  }

  verifyWebhookSignature(): boolean {
    return false; // COD has no webhooks
  }
}
