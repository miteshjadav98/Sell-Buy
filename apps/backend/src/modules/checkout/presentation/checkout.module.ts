import { Module } from '@nestjs/common';
import { InventoryModule } from '../../inventory/inventory.module';
import { CheckoutPricingService } from '../application/services/checkout-pricing.service';
import { PaymentSettlementService } from '../application/services/payment-settlement.service';
import { ConfirmPaymentUseCase } from '../application/use-cases/confirm-payment.use-case';
import { ExpirePendingOrdersUseCase } from '../application/use-cases/expire-pending-orders.use-case';
import { HandlePaymentWebhookUseCase } from '../application/use-cases/handle-payment-webhook.use-case';
import { PlaceOrderUseCase } from '../application/use-cases/place-order.use-case';
import { PreviewCheckoutUseCase } from '../application/use-cases/preview-checkout.use-case';
import {
  GstInclusiveTaxStrategy,
  TAX_STRATEGY,
} from '../domain/pricing/tax.strategy';
import {
  SHIPPING_STRATEGY,
  WeightBandedShippingStrategy,
} from '../domain/pricing/shipping.strategy';
import {
  CHECKOUT_ADDRESS_READER,
  CHECKOUT_CART_READER,
  COUPON_REPOSITORY,
  ORDER_REPOSITORY,
  PAYMENT_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../domain/ports/checkout.ports';
import { AddressPrismaReader } from '../infrastructure/address.prisma.reader';
import { CheckoutCartPrismaReader } from '../infrastructure/checkout-cart.prisma.reader';
import { CouponPrismaRepository } from '../infrastructure/coupon.prisma.repository';
import { OrderPrismaRepository } from '../infrastructure/order.prisma.repository';
import { PaymentPrismaRepository } from '../infrastructure/payment.prisma.repository';
import { WebhookEventPrismaRepository } from '../infrastructure/webhook-event.prisma.repository';
import { CheckoutController } from './checkout.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PendingOrderSweeper } from './pending-order.sweeper';

/**
 * Composition root for checkout — the file that answers "who satisfies these
 * interfaces?" so that no use case has to.
 *
 * The two `useValue` bindings are the ones worth pausing on. "GST is inside the
 * displayed price" and "delivery is priced by weight with free shipping over
 * ₹499" are business policy, and this is where they are chosen. Switching to
 * tax-exclusive pricing for a second market, or to flat-rate delivery, is a
 * change to these two lines — no use case, repository or controller is touched,
 * because none of them knows which strategy it got.
 *
 * Everything else arrives ambiently: PrismaModule, PaymentInfrastructureModule
 * (the gateway factory and circuit breakers) and EventsModule are all @Global.
 * InventoryModule is imported explicitly because reservations are a capability
 * this module borrows, and the import is the record of that dependency.
 */
@Module({
  imports: [InventoryModule],
  controllers: [CheckoutController, PaymentWebhookController],
  providers: [
    // --- Use cases and the services they share ---
    PreviewCheckoutUseCase,
    PlaceOrderUseCase,
    ConfirmPaymentUseCase,
    HandlePaymentWebhookUseCase,
    ExpirePendingOrdersUseCase,
    CheckoutPricingService,
    PaymentSettlementService,
    PendingOrderSweeper,

    // --- Pricing policy (Strategy) ---
    { provide: TAX_STRATEGY, useValue: new GstInclusiveTaxStrategy() },
    { provide: SHIPPING_STRATEGY, useValue: new WeightBandedShippingStrategy() },

    // --- Port bindings (Dependency Inversion) ---
    { provide: CHECKOUT_CART_READER, useClass: CheckoutCartPrismaReader },
    { provide: CHECKOUT_ADDRESS_READER, useClass: AddressPrismaReader },
    { provide: COUPON_REPOSITORY, useClass: CouponPrismaRepository },
    { provide: ORDER_REPOSITORY, useClass: OrderPrismaRepository },
    { provide: PAYMENT_REPOSITORY, useClass: PaymentPrismaRepository },
    { provide: WEBHOOK_EVENT_REPOSITORY, useClass: WebhookEventPrismaRepository },
  ],
})
export class CheckoutModule {}
