import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Roles } from '../../../common/decorators/auth.decorators';
import { CreateCategoryDto, ReviewProductDto } from '../application/dto/catalog.dto';
import { CreateCategoryUseCase } from '../application/use-cases/create-category.use-case';
import { ReviewProductUseCase } from '../application/use-cases/review-product.use-case';

/**
 * Admin governance of the catalogue: approving/rejecting seller submissions and
 * curating the category taxonomy. Gated to ADMIN — this is the marketplace
 * acting as gatekeeper, the reason a seller cannot self-publish.
 */
@ApiTags('Catalog — Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(
    private readonly reviewProduct: ReviewProductUseCase,
    private readonly createCategory: CreateCategoryUseCase,
  ) {}

  @Post('products/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a product awaiting review' })
  @ApiResponse({ status: 409, description: 'Product is not awaiting review' })
  @ApiResponse({ status: 422, description: 'Rejection without a reason' })
  async review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProductDto,
  ) {
    return this.reviewProduct.execute({ adminId: admin.sub, productId: id, dto });
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a category (optionally under a parent)' })
  @ApiResponse({ status: 201, description: 'Created category node' })
  async category(@Body() dto: CreateCategoryDto) {
    return this.createCategory.execute(dto);
  }
}
