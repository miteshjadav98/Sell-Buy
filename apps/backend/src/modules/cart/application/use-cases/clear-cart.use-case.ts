import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { CART_REPOSITORY, CartIdentity, ICartRepository } from '../../domain/ports/cart.ports';
import { CartView } from '../cart-view';
import { CartQueryService } from '../services/cart-query.service';

/** Empties the active cart. Saved-for-later lines are deliberately left alone. */
@Injectable()
export class ClearCartUseCase implements IUseCase<CartIdentity, CartView> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: ICartRepository,
    private readonly view: CartQueryService,
  ) {}

  async execute(identity: CartIdentity): Promise<CartView> {
    const cartId = await this.carts.getOrCreateActiveCartId(identity);
    await this.carts.clearActiveItems(cartId);
    return this.view.render(cartId);
  }
}
