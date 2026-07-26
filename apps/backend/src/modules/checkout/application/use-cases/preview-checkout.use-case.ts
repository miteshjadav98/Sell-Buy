import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  IInventoryAvailabilityReader,
  INVENTORY_AVAILABILITY_READER,
} from '../../../inventory/domain/ports/inventory.ports';
import { PaymentGatewayFactory } from '../../../../infrastructure/payments/payment-gateway.factory';
import {
  CHECKOUT_ADDRESS_READER,
  CHECKOUT_CART_READER,
  DeliveryAddress,
  IAddressReader,
  ICheckoutCartReader,
} from '../../domain/ports/checkout.ports';
import { CheckoutSummaryView, buildCheckoutSummary } from '../checkout-view';
import { CheckoutPricingService } from '../services/checkout-pricing.service';

export interface PreviewCheckoutInput {
  userId: string;
  addressId?: string;
  couponCode?: string;
  giftWrap?: boolean;
}

/**
 * The review screen: what this order would cost, and what is stopping it.
 *
 * Read-only and deliberately optimistic — it reads stock without a lock and does
 * not reserve anything. Reserving on preview would let anyone freeze a
 * competitor's inventory by loading a page, and locking rows would hold them for
 * as long as the customer stares at the screen. The authoritative check happens
 * once, under a lock, when they actually pay.
 *
 * Which means `blockers` being empty is a strong hint, not a promise. Place-order
 * re-validates everything and may still refuse.
 */
@Injectable()
export class PreviewCheckoutUseCase implements IUseCase<PreviewCheckoutInput, CheckoutSummaryView> {
  constructor(
    @Inject(CHECKOUT_CART_READER) private readonly carts: ICheckoutCartReader,
    @Inject(CHECKOUT_ADDRESS_READER) private readonly addresses: IAddressReader,
    @Inject(INVENTORY_AVAILABILITY_READER) private readonly inventory: IInventoryAvailabilityReader,
    private readonly pricing: CheckoutPricingService,
    private readonly gateways: PaymentGatewayFactory,
  ) {}

  async execute(input: PreviewCheckoutInput): Promise<CheckoutSummaryView> {
    const cart = await this.carts.loadForUser(input.userId);
    if (!cart || cart.lines.length === 0) {
      throw new BusinessRuleError('Your cart is empty');
    }

    const address = await this.resolveAddress(input.userId, input.addressId);

    const priced = await this.pricing.price({
      userId: input.userId,
      lines: cart.lines,
      // An explicit code beats the one remembered on the cart, so clearing the
      // field in the UI actually clears the discount.
      couponCode: input.couponCode ?? cart.couponCode,
      giftWrap: input.giftWrap ?? cart.giftWrap,
      // With no address yet, shipping is quoted without the remote-area
      // surcharge and the summary says so via `addressRequired`.
      destinationPostalCode: address?.postalCode ?? '',
    });

    const stock = await this.inventory.availableMany(cart.lines.map((line) => line.variantId));

    return buildCheckoutSummary({
      cartId: cart.cartId,
      lines: cart.lines,
      totals: priced.totals,
      stock,
      address,
      couponCode: input.couponCode ?? cart.couponCode,
      couponApplied: priced.coupon !== null,
      couponFreeShipping: priced.coupon?.freeShipping ?? false,
      couponRejectedReason: priced.couponRejectedReason,
      taxIncludedInPrice: priced.taxIncludedInPrice,
      // Asked at render time so a gateway outage removes the method from the UI
      // instead of failing the customer after they have chosen it.
      availablePaymentMethods: this.gateways.availableMethods(),
    });
  }

  private async resolveAddress(
    userId: string,
    addressId?: string,
  ): Promise<DeliveryAddress | null> {
    if (!addressId) return this.addresses.findDefault(userId);

    const address = await this.addresses.findOwned(userId, addressId);
    // A uuid that exists but belongs to someone else is a 404, not a 403 — the
    // difference would confirm the address exists.
    if (!address) throw new NotFoundError('Address', addressId);
    return address;
  }
}
