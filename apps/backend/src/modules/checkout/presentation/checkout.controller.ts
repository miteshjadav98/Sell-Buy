import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/auth.decorators';
import { RateLimit, RateLimitPresets } from '../../../common/decorators/rate-limit.decorator';
import {
  ConfirmPaymentDto,
  PlaceOrderDto,
  PreviewCheckoutDto,
} from '../application/dto/checkout.dto';
import { ConfirmPaymentUseCase } from '../application/use-cases/confirm-payment.use-case';
import { PlaceOrderUseCase } from '../application/use-cases/place-order.use-case';
import { PreviewCheckoutUseCase } from '../application/use-cases/preview-checkout.use-case';

/**
 * Checkout is the one flow with no guest path.
 *
 * The cart is deliberately open to anyone — turning a browsing shopper away is
 * how you lose them. But an order needs an owner: somewhere to send it, someone
 * to refund, someone to show it to in "my orders". So these routes require a
 * token, and the front end merges the guest cart at login before arriving here.
 *
 * Identity is taken from the verified token and never from the body. A `userId`
 * in a payload is a claim by the caller; `@CurrentUser()` is a claim checked
 * against a signature.
 */
@ApiTags('Checkout')
@ApiBearerAuth()
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly preview: PreviewCheckoutUseCase,
    private readonly placeOrder: PlaceOrderUseCase,
    private readonly confirmPayment: ConfirmPaymentUseCase,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Price the cart for checkout — totals, coupon result, and anything blocking the order',
  })
  @ApiResponse({ status: 409, description: 'The cart is empty' })
  async summary(@CurrentUser() user: AuthenticatedUser, @Query() query: PreviewCheckoutDto) {
    return this.preview.execute({
      userId: user.sub,
      addressId: query.addressId,
      couponCode: query.couponCode,
      giftWrap: query.giftWrap,
    });
  }

  /**
   * The rate limit here is per user rather than per IP, and tighter than the
   * global budget. Order placement is the most expensive thing this API does —
   * it takes row locks and calls a payment gateway — so a client stuck in a
   * retry loop must be stopped before it drags the checkout of every other
   * shopper down with it.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(RateLimitPresets.PAYMENT)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Send a stable uuid per checkout attempt. Retrying with the same key returns the ' +
      'order that was already created instead of placing a second one — which is what ' +
      'stops a double-tap on "Pay" becoming two charges.',
  })
  @ApiOperation({ summary: 'Place the order and open a payment intent' })
  @ApiResponse({ status: 201, description: 'Order created; COD is already CONFIRMED' })
  @ApiResponse({ status: 409, description: 'Out of stock, empty cart, or an unavailable item' })
  @ApiResponse({ status: 503, description: 'Every online gateway is down — offer Cash on Delivery' })
  async place(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.placeOrder.execute({
      userId: user.sub,
      customerEmail: user.email,
      addressId: dto.addressId,
      billingAddressId: dto.billingAddressId,
      paymentMethod: dto.paymentMethod,
      preferredGateway: dto.preferredGateway,
      couponCode: dto.couponCode,
      giftWrap: dto.giftWrap,
      customerNote: dto.customerNote,
      idempotencyKey,
    });
  }

  @Post('payments/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.PAYMENT)
  @ApiOperation({
    summary: 'Report a completed gateway payment (verified server-side; the webhook is authoritative)',
  })
  @ApiResponse({ status: 402, description: 'Signature or amount did not check out' })
  async confirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmPaymentDto) {
    return this.confirmPayment.execute({
      userId: user.sub,
      gatewayOrderId: dto.gatewayOrderId,
      gatewayPaymentId: dto.gatewayPaymentId,
      signature: dto.signature,
    });
  }
}
