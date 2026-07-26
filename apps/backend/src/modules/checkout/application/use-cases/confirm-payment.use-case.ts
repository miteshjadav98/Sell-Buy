import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, PaymentFailedError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { PaymentGatewayFactory } from '../../../../infrastructure/payments/payment-gateway.factory';
import {
  IOrderRepository,
  IPaymentRepository,
  ORDER_REPOSITORY,
  PAYMENT_REPOSITORY,
} from '../../domain/ports/checkout.ports';
import { PaymentSettlementService } from '../services/payment-settlement.service';

export interface ConfirmPaymentInput {
  userId: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface ConfirmPaymentResult {
  orderId: string;
  confirmed: boolean;
  /** True when the webhook had already settled this payment. */
  alreadySettled: boolean;
}

/**
 * The browser returning from the gateway sheet saying "that worked".
 *
 * The webhook is the authoritative path and this endpoint is a latency
 * optimisation — without it the customer stares at a spinner until the gateway
 * gets round to calling us, which can be seconds or, during an incident,
 * minutes. With it, the confirmation is immediate and the webhook becomes a
 * no-op replay.
 *
 * What it emphatically does NOT do is trust the caller. The client supplies
 * three strings; the gateway adapter verifies the HMAC over them and then asks
 * the gateway directly what the payment's status and amount actually are. A
 * checkout that confirms an order because the browser said so is a free-order
 * button, and it will be found.
 */
@Injectable()
export class ConfirmPaymentUseCase implements IUseCase<ConfirmPaymentInput, ConfirmPaymentResult> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    private readonly gateways: PaymentGatewayFactory,
    private readonly settlement: PaymentSettlementService,
  ) {}

  async execute(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    const payment = await this.payments.findByGatewayOrderId(input.gatewayOrderId);
    if (!payment) throw new NotFoundError('Payment', input.gatewayOrderId);

    const order = await this.orders.findById(payment.orderId);
    if (!order) throw new NotFoundError('Order', payment.orderId);

    // Knowing a gateway order id must not be enough to confirm somebody else's
    // order — those ids travel through the browser and get logged.
    if (order.userId !== input.userId) throw new ForbiddenError();

    // The exact gateway that issued the intent, never a re-routed one: a
    // Razorpay signature is meaningless to Stripe.
    const gateway = this.gateways.forGateway(payment.gateway);

    const verification = await gateway.verify({
      gatewayOrderId: input.gatewayOrderId,
      gatewayPaymentId: input.gatewayPaymentId,
      signature: input.signature,
    });

    if (!verification.verified) {
      await this.settlement.fail(payment, verification.failureReason ?? 'Verification failed');
      throw new PaymentFailedError(verification.failureReason ?? 'Payment could not be verified');
    }

    /**
     * The amount is checked against what the order actually costs. A verified
     * signature proves the gateway issued the payment; it does not prove the
     * payment was for the right amount, and a tampered client that paid ₹1 for a
     * ₹50,000 order would otherwise sail through.
     */
    if (verification.amountMinor > 0 && verification.amountMinor !== payment.amountMinor) {
      await this.settlement.fail(
        payment,
        `Amount mismatch: gateway captured ${verification.amountMinor}, order expects ${payment.amountMinor}`,
      );
      throw new PaymentFailedError('The amount paid does not match the order total');
    }

    const confirmed = await this.settlement.capture(payment, {
      gatewayPaymentId: verification.gatewayPaymentId,
      signature: input.signature,
    });

    return { orderId: payment.orderId, confirmed: true, alreadySettled: !confirmed };
  }
}
