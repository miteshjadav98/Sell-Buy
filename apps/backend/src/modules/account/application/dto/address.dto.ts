import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { POSTAL_CODE_PATTERN } from '../../domain/address.policy';

export class CreateAddressDto {
  @ApiPropertyOptional({ enum: AddressType, default: AddressType.HOME })
  @IsOptional()
  @IsEnum(AddressType)
  type: AddressType = AddressType.HOME;

  @ApiProperty({ description: 'Recipient name — not necessarily the account holder' })
  @IsString()
  @Length(2, 100)
  fullName!: string;

  @ApiProperty({ example: '9876543210', description: 'Contact number for the courier' })
  @IsString()
  @Matches(/^[6-9][0-9]{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
  phone!: string;

  @ApiProperty()
  @IsString()
  @Length(3, 200)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'Helps the courier find it; never used for routing' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  landmark?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  city!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  state!: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  country?: string;

  @ApiProperty({
    example: '560001',
    description:
      'Six digits. Validated because shipping is priced from it and a wrong PIN routes the ' +
      'parcel to the wrong state before anyone notices.',
  })
  @IsString()
  @Matches(POSTAL_CODE_PATTERN, { message: 'postalCode must be a valid 6-digit Indian PIN code' })
  postalCode!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Ignored for the very first address, which always becomes the default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * Update is a full replacement rather than a patch.
 *
 * A partially-updated address is a genuinely dangerous object: change the city
 * but not the PIN code and you have an address that passes validation, prices
 * shipping from one place and delivers to another. Requiring the whole thing
 * means the client sends a coherent address or none at all.
 */
export class UpdateAddressDto extends CreateAddressDto {}

export class SetDefaultAddressDto {
  @ApiProperty({ description: 'Only true is meaningful; a default cannot be unset, only moved' })
  @IsBoolean()
  isDefault!: boolean;
}
