import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentGateway, PaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

/**
 * Note what is absent from every DTO here: prices, totals, discounts, tax.
 *
 * The client sends *intent* — which address, which coupon code, which payment
 * method — and the server derives every number from the database. A checkout
 * that accepts an amount from the browser is a checkout where the amount is
 * whatever the browser says, and no amount of front-end validation changes that.
 */

export class PreviewCheckoutDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to the saved default address' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ description: 'Coupon to try. An ineligible code is reported, not fatal.' })
  @IsOptional()
  @IsString()
  @Length(3, 40)
  couponCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  giftWrap?: boolean;
}

export class PlaceOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Must belong to the signed-in user' })
  @IsUUID()
  addressId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to the shipping address' })
  @IsOptional()
  @IsUUID()
  billingAddressId?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentGateway,
    description:
      'A hint, not an instruction. The factory overrides it when that gateway’s circuit is open.',
  })
  @IsOptional()
  @IsEnum(PaymentGateway)
  preferredGateway?: PaymentGateway;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 40)
  couponCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  giftWrap?: boolean;

  @ApiPropertyOptional({ description: 'Delivery instructions, shown to the courier' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;
}

/**
 * The browser's report that the gateway sheet succeeded.
 *
 * Treated as a hint that something *may* have happened, never as proof. The
 * signature is verified server-side and the amount is re-read from the gateway,
 * because a client that can assert its own payment succeeded is a free-order
 * button. The webhook is the authoritative path; this exists so the customer
 * gets a confirmed order in the same second rather than whenever the webhook
 * lands.
 */
export class ConfirmPaymentDto {
  @ApiProperty({ description: 'The gateway’s order/intent id' })
  @IsString()
  @Length(3, 200)
  gatewayOrderId!: string;

  @ApiProperty({ description: 'The gateway’s payment id' })
  @IsString()
  @Length(3, 200)
  gatewayPaymentId!: string;

  @ApiProperty({ description: 'HMAC signature issued by the gateway' })
  @IsString()
  @Length(3, 500)
  signature!: string;
}
