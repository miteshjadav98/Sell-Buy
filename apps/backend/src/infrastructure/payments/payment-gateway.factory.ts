import { Injectable, Logger } from '@nestjs/common';
import { PaymentGateway, PaymentMethod } from '@prisma/client';
import { BusinessRuleError } from '../../common/errors/domain.errors';
import { CircuitState } from '../resilience/circuit-breaker';
import { CircuitBreakerRegistry } from '../resilience/circuit-breaker.registry';
import { CodAdapter } from './adapters/cod.adapter';
import { RazorpayAdapter } from './adapters/razorpay.adapter';
import { StripeAdapter } from './adapters/stripe.adapter';
import { IPaymentGateway } from './payment-gateway.port';

/**
 * Factory — the single place that decides which gateway handles a payment.
 *
 * Without it, that decision gets copy-pasted into checkout, refunds, webhooks
 * and the retry worker, and they drift apart. With it, the routing rules live in
 * one file and every caller gets the same answer.
 *
 * It also does something a plain factory would not: it consults the circuit
 * breakers. If Razorpay's circuit is open, the factory transparently routes new
 * payments to Stripe. The customer sees a working checkout during a vendor
 * outage rather than an error page — which is the entire business case for
 * integrating two gateways in the first place.
 */
@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name);
  private readonly gateways: Map<PaymentGateway, IPaymentGateway>;

  constructor(
    razorpay: RazorpayAdapter,
    stripe: StripeAdapter,
    cod: CodAdapter,
    private readonly breakers: CircuitBreakerRegistry,
  ) {
    this.gateways = new Map<PaymentGateway, IPaymentGateway>([
      [PaymentGateway.RAZORPAY, razorpay],
      [PaymentGateway.STRIPE, stripe],
      [PaymentGateway.COD, cod],
    ]);
  }

  /** Exact gateway — used by webhooks and refunds, which must not be re-routed. */
  forGateway(gateway: PaymentGateway): IPaymentGateway {
    const adapter = this.gateways.get(gateway);
    if (!adapter) throw new BusinessRuleError(`Unsupported payment gateway: ${gateway}`);
    return adapter;
  }

  /**
   * Picks a healthy gateway for a new payment.
   *
   * Preference order for online methods is Razorpay (better UPI/net-banking
   * coverage in India) then Stripe, but a gateway with an open circuit is
   * skipped entirely.
   */
  forMethod(method: PaymentMethod, preferred?: PaymentGateway): IPaymentGateway {
    if (method === PaymentMethod.COD) return this.forGateway(PaymentGateway.COD);

    const candidates: PaymentGateway[] = preferred
      ? [preferred, ...this.onlineGateways().filter((g) => g !== preferred)]
      : this.onlineGateways();

    for (const name of candidates) {
      const adapter = this.gateways.get(name);
      if (!adapter?.supports(method)) continue;

      if (this.isHealthy(name)) return adapter;
      this.logger.warn(`Skipping ${name}: circuit is open`);
    }

    // Every online option is unavailable. Say so honestly and let the caller
    // offer COD, rather than sending the customer into a gateway that is down.
    throw new BusinessRuleError(
      'Online payments are temporarily unavailable. Please try Cash on Delivery.',
    );
  }

  /** Methods the storefront should actually render right now. */
  availableMethods(): PaymentMethod[] {
    const available = new Set<PaymentMethod>([PaymentMethod.COD]);

    for (const name of this.onlineGateways()) {
      if (!this.isHealthy(name)) continue;
      const adapter = this.gateways.get(name);
      for (const method of Object.values(PaymentMethod)) {
        if (adapter?.supports(method)) available.add(method);
      }
    }

    return [...available];
  }

  private onlineGateways(): PaymentGateway[] {
    return [PaymentGateway.RAZORPAY, PaymentGateway.STRIPE];
  }

  private isHealthy(gateway: PaymentGateway): boolean {
    const breaker = this.breakers.get(gateway.toLowerCase(), 'payment');
    return breaker.getMetrics().state !== CircuitState.OPEN;
  }
}
