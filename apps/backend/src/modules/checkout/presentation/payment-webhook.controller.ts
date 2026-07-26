import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { PaymentGateway } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/auth.decorators';
import { UnauthorizedError } from '../../../common/errors/domain.errors';
import { HandlePaymentWebhookUseCase } from '../application/use-cases/handle-payment-webhook.use-case';

/**
 * Where the gateways call us back.
 *
 * `@Public` because a payment provider has no bearer token — but public here
 * means "not authenticated by JWT", not "unauthenticated". The HMAC signature IS
 * the authentication, checked in the use case against the raw bytes, and nothing
 * happens before it passes.
 *
 * The raw body is read from `req.rawBody` rather than the parsed `@Body()`. Once
 * Express has parsed and re-serialised the JSON, key order and number formatting
 * can shift, and a signature computed over the original bytes will never match
 * again. `main.ts` enables `rawBody: true` for exactly this endpoint.
 *
 * It answers 200 to everything it has authenticated, including events it chose
 * to ignore. A non-2xx tells the gateway to retry, and retrying an event already
 * recorded achieves nothing but load — worse, gateways disable endpoints that
 * keep failing, which would silently stop every order confirming.
 */
@ApiTags('Payments')
@Controller('payments/webhook')
export class PaymentWebhookController {
  constructor(private readonly handleWebhook: HandlePaymentWebhookUseCase) {}

  @Public()
  @Post(':gateway')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // not part of the public API surface; called only by gateways
  async receive(
    @Param('gateway', new ParseEnumPipe(PaymentGateway)) gateway: PaymentGateway,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') razorpaySignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody) {
      // Without the raw bytes the signature cannot be verified, and an
      // unverifiable webhook is indistinguishable from a forged one.
      throw new UnauthorizedError('Webhook body could not be read');
    }

    const signature = gateway === PaymentGateway.STRIPE ? stripeSignature : razorpaySignature;
    if (!signature) throw new UnauthorizedError('Missing webhook signature');

    return this.handleWebhook.execute({ gateway, rawBody, signature });
  }
}
