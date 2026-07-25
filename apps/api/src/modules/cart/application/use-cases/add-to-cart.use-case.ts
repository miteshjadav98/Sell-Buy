import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { resolveLineQuantity } from '../../domain/cart.policy';
import {
  CART_REPOSITORY,
  CartIdentity,
  ICartRepository,
  IInventoryReader,
  INVENTORY_READER,
  IVariantPricingReader,
  VARIANT_PRICING_READER,
} from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { raiseQuantityError } from '../quantity-error';
import { CartQueryService } from '../services/cart-query.service';

export interface AddToCartInput {
  identity: CartIdentity;
  variantId: string;
  quantity: number;
}

/**
 * Adds a variant to the cart, or tops up the quantity if it is already there.
 *
 * Two truths are read live and never trusted from the client: the price (so a
 * stale page cannot dictate what something costs) and the stock (so the cart
 * cannot hold more than exists). Adding is additive — asking for 2 more of a
 * line that holds 3 is validated as 5, because the cap and the stock limit apply
 * to what the line will actually contain.
 */
@Injectable()
export class AddToCartUseCase implements IUseCase<AddToCartInput, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    @Inject(VARIANT_PRICING_READER) private readonly pricing: IVariantPricingReader,
    @Inject(INVENTORY_READER) private readonly inventory: IInventoryReader,
    private readonly view: CartQueryService,
  ) {}

  async execute({ identity, variantId, quantity }: AddToCartInput): Promise<CartView> {
    const variant = await this.pricing.find(variantId);
    if (!variant || !variant.purchasable) {
      // A missing or unlisted variant is a 404 to the shopper — the same answer
      // whether it never existed or was just delisted.
      throw new NotFoundError('Product variant', variantId);
    }

    const cartId = await this.carts.getOrCreateActiveCartId(identity);
    const existing = await this.carts.findItemByVariant(cartId, variantId);
    const desired = (existing?.quantity ?? 0) + quantity;

    const available = await this.inventory.available(variantId);
    const decision = resolveLineQuantity(desired, available);
    if (decision.isFailure) {
      raiseQuantityError(decision.error, variant.title, available);
    }

    await this.carts.upsertItem(cartId, variantId, decision.unwrap().quantity, variant.unitPrice);
    return this.view.render(cartId);
  }
}
