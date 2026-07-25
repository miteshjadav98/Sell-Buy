import { Inject, Injectable } from '@nestjs/common';
import {
  CART_REPOSITORY,
  ICartRepository,
  IInventoryReader,
  INVENTORY_READER,
} from '../../domain/ports/cart.ports';
import { buildCartView, CartView } from '../cart-view';

/**
 * Loads a cart and renders it — used by the "view cart" endpoint and returned by
 * every mutation so the client always gets fresh, fully-computed state back
 * without a second round-trip.
 *
 * It is one small service rather than duplicated code in seven use cases: read
 * the lines, read live stock for exactly those variants in a single batch, hand
 * both to the pure builder.
 */
@Injectable()
export class CartQueryService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    @Inject(INVENTORY_READER) private readonly inventory: IInventoryReader,
  ) {}

  async render(cartId: string): Promise<CartView> {
    const lines = await this.carts.getLines(cartId);
    const stock = lines.length
      ? await this.inventory.availableMany(lines.map((l) => l.variantId))
      : new Map<string, number>();
    return buildCartView(cartId, lines, stock);
  }
}
