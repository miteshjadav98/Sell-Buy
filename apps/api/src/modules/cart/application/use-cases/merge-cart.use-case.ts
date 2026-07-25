import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { MAX_QUANTITY_PER_ITEM } from '../../domain/cart.policy';
import {
  CART_REPOSITORY,
  ICartRepository,
  IInventoryReader,
  INVENTORY_READER,
} from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { CartQueryService } from '../services/cart-query.service';

export interface MergeCartInput {
  userId: string;
  sessionId: string;
}

/**
 * Folds a guest cart into the signed-in shopper's cart on login — the reason a
 * cart survives the login wall instead of vanishing.
 *
 * Two rules make this safe. First, it is additive with a ceiling: a variant in
 * both carts sums, then clamps to stock and the per-item cap. Second, it never
 * throws — a login must not fail because a guest line went out of stock, so an
 * unmergeable line is simply dropped and the shopper sees the clamped result.
 */
@Injectable()
export class MergeCartUseCase implements IUseCase<MergeCartInput, CartView> {
  private readonly logger = new Logger(MergeCartUseCase.name);

  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    @Inject(INVENTORY_READER) private readonly inventory: IInventoryReader,
    private readonly view: CartQueryService,
  ) {}

  async execute({ userId, sessionId }: MergeCartInput): Promise<CartView> {
    const userCartId = await this.carts.getOrCreateActiveCartId({ userId });
    const guestCartId = await this.carts.findActiveCartId({ sessionId });

    // Nothing to merge, or the guest cart is already the user's cart.
    if (!guestCartId || guestCartId === userCartId) {
      return this.view.render(userCartId);
    }

    const guestLines = await this.carts.getLines(guestCartId);
    const userLines = await this.carts.getLines(userCartId);
    const existing = new Map(userLines.map((l) => [l.variantId, l.quantity]));

    const stock = guestLines.length
      ? await this.inventory.availableMany(guestLines.map((l) => l.variantId))
      : new Map<string, number>();

    let merged = 0;
    for (const line of guestLines) {
      const available = stock.get(line.variantId) ?? 0;
      if (available <= 0) continue; // can't carry an out-of-stock line across

      const combined = (existing.get(line.variantId) ?? 0) + line.quantity;
      const quantity = Math.min(combined, available, MAX_QUANTITY_PER_ITEM);
      if (quantity < 1) continue;

      // Merged lines land in the active cart; re-snapshot to the guest's price so
      // the "price changed" notice still works against the moment it was added.
      await this.carts.upsertItem(userCartId, line.variantId, quantity, line.priceSnapshot);
      merged++;
    }

    // The guest cart is spent — delete it so its unique sessionId frees up and it
    // can never be merged twice.
    await this.carts.deleteCart(guestCartId);
    this.logger.log(`Merged ${merged}/${guestLines.length} guest lines into cart ${userCartId}`);

    return this.view.render(userCartId);
  }
}
