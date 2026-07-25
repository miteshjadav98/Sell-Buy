import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthenticatedUser, Public } from '../../../common/decorators/auth.decorators';
import { CartIdentity } from '../domain/ports/cart.ports';
import {
  AddToCartDto,
  MergeCartDto,
  SaveForLaterDto,
  UpdateCartItemDto,
} from '../application/dto/cart.dto';
import { AddToCartUseCase } from '../application/use-cases/add-to-cart.use-case';
import { ClearCartUseCase } from '../application/use-cases/clear-cart.use-case';
import { GetCartUseCase } from '../application/use-cases/get-cart.use-case';
import { MergeCartUseCase } from '../application/use-cases/merge-cart.use-case';
import { RemoveCartItemUseCase } from '../application/use-cases/remove-cart-item.use-case';
import { SaveForLaterUseCase } from '../application/use-cases/save-for-later.use-case';
import { UpdateCartItemUseCase } from '../application/use-cases/update-cart-item.use-case';

const CART_COOKIE = 'sb_cart';

/**
 * The cart works for signed-in shoppers and guests alike. Identity is resolved
 * per request: a verified token means a user cart; otherwise a guest cart keyed
 * by an opaque id in an httpOnly cookie, minted on first touch. The routes are
 * @Public so a guest is never turned away — the JwtAuthGuard still decodes a
 * token when one is present, so a logged-in shopper is recognised without the
 * route demanding it.
 *
 * Deciding *where* the guest id lives (a cookie) and minting it is transport, so
 * it lives here and nowhere deeper.
 */
@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(
    private readonly getCart: GetCartUseCase,
    private readonly addToCart: AddToCartUseCase,
    private readonly updateItem: UpdateCartItemUseCase,
    private readonly removeItem: RemoveCartItemUseCase,
    private readonly saveForLater: SaveForLaterUseCase,
    private readonly clearCart: ClearCartUseCase,
    private readonly mergeCart: MergeCartUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'The current cart, with live prices, stock and totals' })
  async view(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.getCart.execute(this.identity(req, res));
  }

  @Public()
  @Post('items')
  @ApiOperation({ summary: 'Add a variant to the cart (tops up if already present)' })
  @ApiResponse({ status: 404, description: 'Variant not found or not purchasable' })
  @ApiResponse({ status: 409, description: 'Requested quantity exceeds stock or the per-item cap' })
  async add(
    @Body() dto: AddToCartDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.addToCart.execute({
      identity: this.identity(req, res),
      variantId: dto.variantId,
      quantity: dto.quantity,
    });
  }

  @Public()
  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Set a line to an absolute quantity' })
  async update(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.updateItem.execute({ identity: this.identity(req, res), itemId, quantity: dto.quantity });
  }

  @Public()
  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a line from the cart' })
  async remove(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.removeItem.execute({ identity: this.identity(req, res), itemId });
  }

  @Public()
  @Patch('items/:itemId/saved')
  @ApiOperation({ summary: 'Move a line to or from saved-for-later' })
  async saved(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveForLaterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.saveForLater.execute({
      identity: this.identity(req, res),
      itemId,
      savedForLater: dto.savedForLater,
    });
  }

  @Public()
  @Delete()
  @ApiOperation({ summary: 'Empty the cart (saved-for-later is kept)' })
  async clear(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.clearCart.execute(this.identity(req, res));
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fold the guest cart into the signed-in cart (call once, after login)' })
  async merge(
    @Body() dto: MergeCartDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as AuthenticatedUser;
    // Prefer the cookie the browser still holds from the guest session; the body
    // is a fallback for native clients that carried the id themselves.
    const sessionId = (req.cookies?.[CART_COOKIE] as string | undefined) ?? dto.sessionId;

    if (!sessionId) {
      // Nothing to merge — just return the user's cart untouched.
      return this.getCart.execute({ userId: user.sub });
    }

    const result = await this.mergeCart.execute({ userId: user.sub, sessionId });
    // The guest cookie is spent; clearing it makes a repeat merge a no-op.
    res.clearCookie(CART_COOKIE, { path: '/' });
    return result;
  }

  /**
   * A signed-in shopper is their user id; a guest is the id in their cookie, one
   * being minted (and the cookie set) on first contact. httpOnly keeps the id
   * out of reach of page scripts; the merge endpoint reads it server-side.
   */
  private identity(req: Request, res: Response): CartIdentity {
    const user = req.user as AuthenticatedUser | undefined;
    if (user) return { userId: user.sub };

    let sessionId = req.cookies?.[CART_COOKIE] as string | undefined;
    if (!sessionId) {
      sessionId = randomUUID();
      res.cookie(CART_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1_000, // 30 days
      });
    }
    return { sessionId };
  }
}
