import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Roles } from '../../../common/decorators/auth.decorators';
import { CreateProductDto } from '../application/dto/catalog.dto';
import { CreateProductUseCase } from '../application/use-cases/create-product.use-case';
import { ListSellerProductsUseCase } from '../application/use-cases/list-seller-products.use-case';
import { SubmitProductUseCase } from '../application/use-cases/submit-product.use-case';

class SellerCatalogQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

/**
 * The seller's write surface over their own catalogue. Every route is gated to
 * the SELLER role, and every use case behind it re-resolves the seller from the
 * verified token and scopes the operation to that seller — the role opens the
 * door, the use case makes sure a seller only ever touches their own products.
 */
@ApiTags('Catalog — Seller')
@ApiBearerAuth()
@Roles('SELLER')
@Controller('seller/products')
export class SellerProductController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly submitProduct: SubmitProductUseCase,
    private readonly listSellerProducts: ListSellerProductsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a product (lands in DRAFT)' })
  @ApiResponse({ status: 201, description: 'Created; returns id, slug and status' })
  @ApiResponse({ status: 403, description: 'Caller is not an approved seller' })
  @ApiResponse({ status: 422, description: 'Variant/option validation failed' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.createProduct.execute({ userId: user.sub, dto });
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft (or rejected) product for admin review' })
  @ApiResponse({ status: 403, description: 'Not the owning seller' })
  @ApiResponse({ status: 409, description: 'Product is not in a submittable state' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submitProduct.execute({ userId: user.sub, productId: id });
  }

  @Get()
  @ApiOperation({ summary: "The seller's own catalogue, any status (paged)" })
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() query: SellerCatalogQueryDto) {
    return this.listSellerProducts.execute({
      userId: user.sub,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }
}
