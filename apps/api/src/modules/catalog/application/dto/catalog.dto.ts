import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';

/**
 * A tiny custom validator: variant.optionValues is a string→string map, which
 * class-validator has no built-in for. Declared up top (hoisted) so the DTOs
 * below can decorate with it.
 */
export function IsObjectOfStrings(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isObjectOfStrings',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an object of string values`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
        },
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Create — the seller composes a product, its options, and its variants in one
// request. Validation here is the first gate; the Product entity is the second.
// ---------------------------------------------------------------------------

export class OptionValueInputDto {
  @ApiProperty({ example: 'Blue' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  value!: string;

  @ApiPropertyOptional({ example: '#1e40af', description: 'Swatch colour for colour options' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  hexCode?: string;
}

export class ProductOptionInputDto {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @ApiProperty({ type: [OptionValueInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OptionValueInputDto)
  values!: OptionValueInputDto[];
}

export class VariantInputDto {
  @ApiProperty({ example: 'IPH15-BLU-256' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string;

  @ApiProperty({ example: 'Blue / 256GB' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 79999.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  price!: number;

  @ApiPropertyOptional({ example: 84999.0, description: 'Struck-through MRP; must exceed price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  compareAtPrice?: number;

  @ApiPropertyOptional({ description: 'Seller cost — never exposed publicly' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costPrice?: number;

  @ApiPropertyOptional({ example: 220 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  weightGrams?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({
    example: { Color: 'Blue', Storage: '256GB' },
    description: 'Option name → chosen value. Every product option must be answered.',
  })
  @IsObjectOfStrings()
  optionValues!: Record<string, string>;
}

export class MediaInputDto {
  @ApiProperty({ example: 'https://cdn.sell-buy.com/p/iph15-blue.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  altText?: string;

  @ApiPropertyOptional({ enum: ['IMAGE', 'VIDEO'], default: 'IMAGE' })
  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO'])
  type?: 'IMAGE' | 'VIDEO';
}

export class SpecificationInputDto {
  @ApiProperty({ example: 'Display' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  group!: string;

  @ApiProperty({ example: 'Screen Size' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @ApiProperty({ example: '6.1 inch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value!: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Apple iPhone 15' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ minLength: 20, example: 'A 6.1-inch Super Retina XDR display, the A16 chip…' })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ type: [String], example: ['Dynamic Island', 'USB-C'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  highlights?: string[];

  @ApiPropertyOptional({ example: 18, description: 'GST %; defaults to 18' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({ type: [ProductOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionInputDto)
  options?: ProductOptionInputDto[];

  @ApiProperty({ type: [VariantInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  @ApiPropertyOptional({ type: [MediaInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => MediaInputDto)
  media?: MediaInputDto[];

  @ApiPropertyOptional({ type: [SpecificationInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => SpecificationInputDto)
  specifications?: SpecificationInputDto[];
}

// ---------------------------------------------------------------------------
// Listing query — storefront filters. Cursor-paginated (infinite scroll).
// ---------------------------------------------------------------------------

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to a category (and its descendants)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Comma-separated brand slugs', example: 'apple,samsung' })
  @IsOptional()
  @IsString()
  brands?: string;

  @ApiPropertyOptional({ description: 'Free-text search over title' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: ['newest', 'price_asc', 'price_desc', 'rating', 'popular'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'rating', 'popular'])
  sort: 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular' = 'newest';

  @ApiPropertyOptional({ description: 'id of the last item from the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

// ---------------------------------------------------------------------------
// Category / brand admin inputs.
// ---------------------------------------------------------------------------

export class CreateCategoryDto {
  @ApiProperty({ example: 'Smartphones' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent category, omit for a root category' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  iconUrl?: string;
}

export class ReviewProductDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Required when rejecting — shown to the seller' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
// IsObjectOfStrings is declared at the top of this file (hoisted for the DTOs above).
