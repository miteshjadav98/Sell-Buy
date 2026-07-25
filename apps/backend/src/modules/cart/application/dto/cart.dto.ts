import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_QUANTITY_PER_ITEM } from '../../domain/cart.policy';

export class AddToCartDto {
  @ApiProperty({ format: 'uuid', description: 'The variant (the sellable unit), not the product' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_QUANTITY_PER_ITEM })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity = 1;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY_PER_ITEM, description: 'Absolute quantity, not a delta' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity!: number;
}

export class SaveForLaterDto {
  @ApiProperty({ description: 'true moves the line to saved-for-later, false moves it back' })
  @IsBoolean()
  savedForLater!: boolean;
}

export class MergeCartDto {
  @ApiPropertyOptional({
    description:
      'The guest cart session id to fold in. Optional — the server reads it from ' +
      'the httpOnly sb_cart cookie when omitted.',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
