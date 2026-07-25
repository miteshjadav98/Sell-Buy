import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { CART_REPOSITORY, CartIdentity, ICartRepository } from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { CartQueryService } from '../services/cart-query.service';

export interface SaveForLaterInput {
  identity: CartIdentity;
  itemId: string;
  savedForLater: boolean;
}

/**
 * Moves a line between the active cart and saved-for-later. Stock is not checked
 * on the way *out* of the cart — parking an out-of-stock item to buy later is
 * exactly what the feature is for; availability is re-checked when it moves back
 * and again at checkout.
 */
@Injectable()
export class SaveForLaterUseCase implements IUseCase<SaveForLaterInput, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    private readonly view: CartQueryService,
  ) {}

  async execute({ identity, itemId, savedForLater }: SaveForLaterInput): Promise<CartView> {
    const cartId = await this.carts.getOrCreateActiveCartId(identity);
    const updated = await this.carts.setSavedForLater(cartId, itemId, savedForLater);
    if (!updated) throw new NotFoundError('Cart item', itemId);
    return this.view.render(cartId);
  }
}
