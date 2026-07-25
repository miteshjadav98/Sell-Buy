import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { CART_REPOSITORY, CartIdentity, ICartRepository } from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { CartQueryService } from '../services/cart-query.service';

/**
 * Returns the current cart for a shopper (or guest), creating an empty one on
 * first visit so the client always has a cart id to work against.
 */
@Injectable()
export class GetCartUseCase implements IUseCase<CartIdentity, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    private readonly view: CartQueryService,
  ) {}

  async execute(identity: CartIdentity): Promise<CartView> {
    const cartId = await this.carts.getOrCreateActiveCartId(identity);
    return this.view.render(cartId);
  }
}
