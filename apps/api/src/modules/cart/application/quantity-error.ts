import {
  BusinessRuleError,
  InsufficientStockError,
  ValidationError,
} from '../../../common/errors/domain.errors';
import { MAX_QUANTITY_PER_ITEM } from '../domain/cart.policy';

/**
 * Translates a quantity-policy refusal into the right domain error, in one place
 * so add and update tell a shopper the same thing. Out-of-stock and over-the-cap
 * are genuinely different messages — and different HTTP codes — so the reason
 * from the policy is preserved all the way to the edge.
 */
export function raiseQuantityError(
  reason: 'INVALID' | 'OUT_OF_STOCK' | 'EXCEEDS_STOCK' | 'EXCEEDS_CAP',
  productTitle: string,
  available: number,
): never {
  switch (reason) {
    case 'OUT_OF_STOCK':
      throw new InsufficientStockError(productTitle, 0);
    case 'EXCEEDS_STOCK':
      throw new InsufficientStockError(productTitle, available);
    case 'EXCEEDS_CAP':
      throw new BusinessRuleError(`You can add at most ${MAX_QUANTITY_PER_ITEM} of an item.`);
    case 'INVALID':
      throw new ValidationError('Quantity must be a positive whole number.');
  }
}
