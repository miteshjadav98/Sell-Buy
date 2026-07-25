import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { CART_REPOSITORY, CartIdentity, ICartRepository } from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { CartQueryService } from '../services/cart-query.service';

export interface RemoveCartItemInput {
  identity: CartIdentity;
  itemId: string;
}

/** Removes a line entirely. Scoped to the caller's cart. */
@Injectable()
export class RemoveCartItemUseCase implements IUseCase<RemoveCartItemInput, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    private readonly view: CartQueryService,
  ) {}

  async execute({ identity, itemId }: RemoveCartItemInput): Promise<CartView> {
    const cartId = await this.carts.getOrCreateActiveCartId(identity);
    const removed = await this.carts.removeItem(cartId, itemId);
    if (!removed) throw new NotFoundError('Cart item', itemId);
    return this.view.render(cartId);
  }
}
