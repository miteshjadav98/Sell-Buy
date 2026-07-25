import { Result, fail, ok } from '../../../core/domain/result';

/**
 * The rules a cart line must obey, in one place and free of any framework or
 * database. They are the same whether a line is added by a click, a "buy again"
 * shortcut, or a guest cart merging on login — so they live here, not in a
 * controller or a use case.
 *
 * A cart deliberately does NOT model an aggregate that loads every line to add
 * one: carts mutate a line at a time, and loading the whole thing per click buys
 * nothing. The invariants that matter for a single line are these functions; the
 * use case supplies the live stock figure they can't know on their own.
 */

/** No single line may exceed this, regardless of stock — a soft anti-hoarding cap. */
export const MAX_QUANTITY_PER_ITEM = 10;

export interface QuantityDecision {
  quantity: number;
}

/**
 * Resolves the quantity a line may hold, given what the buyer asked for and what
 * is actually available. Returns the reason on refusal so the caller decides the
 * error — out-of-stock and over-the-cap are different messages to a shopper.
 */
export function resolveLineQuantity(
  requested: number,
  available: number,
): Result<QuantityDecision, 'INVALID' | 'OUT_OF_STOCK' | 'EXCEEDS_STOCK' | 'EXCEEDS_CAP'> {
  if (!Number.isInteger(requested) || requested < 1) {
    return fail('INVALID');
  }
  if (available <= 0) {
    return fail('OUT_OF_STOCK');
  }
  if (requested > available) {
    return fail('EXCEEDS_STOCK');
  }
  if (requested > MAX_QUANTITY_PER_ITEM) {
    return fail('EXCEEDS_CAP');
  }
  return ok({ quantity: requested });
}
