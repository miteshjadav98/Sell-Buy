import { Global, Module } from '@nestjs/common';
import { CircuitBreakerRegistry } from '../resilience/circuit-breaker.registry';
import { CodAdapter } from './adapters/cod.adapter';
import { RazorpayAdapter } from './adapters/razorpay.adapter';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PAYMENT_GATEWAY_FACTORY } from './payment-gateway.port';

/**
 * Adding a gateway is a two-line change here plus one new adapter file —
 * nothing else in the codebase moves. That is Open/Closed with a concrete cost
 * attached: new behaviour costs one file, not a refactor.
 */
@Global()
@Module({
  providers: [
    CircuitBreakerRegistry,
    RazorpayAdapter,
    StripeAdapter,
    CodAdapter,
    PaymentGatewayFactory,
    { provide: PAYMENT_GATEWAY_FACTORY, useExisting: PaymentGatewayFactory },
  ],
  exports: [CircuitBreakerRegistry, PaymentGatewayFactory, PAYMENT_GATEWAY_FACTORY],
})
export class PaymentInfrastructureModule {}
