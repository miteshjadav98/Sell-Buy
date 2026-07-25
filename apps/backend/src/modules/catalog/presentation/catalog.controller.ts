import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/auth.decorators';
import { RateLimit, RateLimitPresets } from '../../../common/decorators/rate-limit.decorator';
import { ProductQueryDto } from '../application/dto/catalog.dto';
import { GetCategoryTreeUseCase } from '../application/use-cases/get-category-tree.use-case';
import { GetProductUseCase } from '../application/use-cases/get-product.use-case';
import { ListBrandsUseCase } from '../application/use-cases/list-brands.use-case';
import { ListProductsUseCase } from '../application/use-cases/list-products.use-case';

/**
 * The storefront read surface — every route is public and every route only
 * reads. There is no write path on this controller at all; the seller and admin
 * controllers hold those, gated by role. Keeping them apart means a reader can
 * never stumble onto a mutation, in code or in the Swagger doc.
 */
@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly categoryTree: GetCategoryTreeUseCase,
    private readonly listBrands: ListBrandsUseCase,
  ) {}

  // Search is the one public read worth a tighter per-route budget (it is the
  // most expensive query). The other reads rely on the global 300/min-per-IP
  // limiter registered in AppModule.
  @Public()
  @Get('products')
  @RateLimit(RateLimitPresets.SEARCH)
  @ApiOperation({ summary: 'Browse live products with filters, sort and cursor paging' })
  async products(@Query() query: ProductQueryDto) {
    return this.listProducts.execute(query);
  }

  @Public()
  @Get('products/:slug')
  @ApiOperation({ summary: 'Full detail for one live product, by slug' })
  @ApiResponse({ status: 404, description: 'No live product with that slug' })
  async product(@Param('slug') slug: string) {
    return this.getProduct.execute(slug);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'The active category tree for navigation and filters' })
  async categories() {
    return this.categoryTree.execute();
  }

  @Public()
  @Get('brands')
  @ApiOperation({ summary: 'Active brands for the brand filter facet' })
  async brands() {
    return this.listBrands.execute();
  }
}
