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

export interface UpdateCartItemInput {
  identity: CartIdentity;
  itemId: string;
  quantity: number;
}

/**
 * Sets a line to an absolute quantity (the quantity stepper on the cart page).
 * Unlike add, the number is taken as-is rather than added, but it passes the
 * same stock and cap checks. The line is looked up scoped to this cart, so one
 * shopper can never edit another's line by guessing an id.
 */
@Injectable()
export class UpdateCartItemUseCase implements IUseCase<UpdateCartItemInput, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    @Inject(VARIANT_PRICING_READER) private readonly pricing: IVariantPricingReader,
    @Inject(INVENTORY_READER) private readonly inventory: IInventoryReader,
    private readonly view: CartQueryService,
  ) {}

  async execute({ identity, itemId, quantity }: UpdateCartItemInput): Promise<CartView> {
    const cartId = await this.carts.getOrCreateActiveCartId(identity);

    const item = await this.carts.findItem(cartId, itemId);
    if (!item) throw new NotFoundError('Cart item', itemId);

    const available = await this.inventory.available(item.variantId);
    const decision = resolveLineQuantity(quantity, available);
    if (decision.isFailure) {
      const variant = await this.pricing.find(item.variantId);
      raiseQuantityError(decision.error, variant?.title ?? 'this item', available);
    }

    await this.carts.setItemQuantity(cartId, itemId, decision.unwrap().quantity);
    return this.view.render(cartId);
  }
}
