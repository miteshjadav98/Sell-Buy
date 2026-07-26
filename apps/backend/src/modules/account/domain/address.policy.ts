import { Result, fail, ok } from '../../../core/domain/result';

/**
 * The rules an address book obeys, free of HTTP and Prisma.
 *
 * There is one invariant here worth stating plainly, because everything else in
 * this file exists to protect it: **a user has at most one default address, and
 * if they have any addresses at all, exactly one of them is the default.**
 *
 * Both halves matter. Two defaults means checkout picks arbitrarily and the
 * customer's parcel goes to their old flat. Zero defaults means the checkout
 * address step opens empty for someone who has three saved addresses, which
 * reads as data loss.
 */

/** A sanity bound. Nobody legitimately keeps more than this. */
export const MAX_ADDRESSES_PER_USER = 20;

/** Indian PIN codes: six digits, never starting with zero. */
export const POSTAL_CODE_PATTERN = /^[1-9][0-9]{5}$/;

export function canAddAnother(currentCount: number): Result<void, 'LIMIT_REACHED'> {
  return currentCount >= MAX_ADDRESSES_PER_USER ? fail('LIMIT_REACHED') : ok(undefined);
}

/**
 * Whether a newly created address should become the default.
 *
 * The first address a user saves is always their default, whether they asked
 * for it or not — the alternative is an address book with entries and no
 * default, which is the "zero defaults" half of the invariant above.
 */
export function shouldBecomeDefault(requested: boolean, existingCount: number): boolean {
  return requested || existingCount === 0;
}

/**
 * Whether deleting this address forces another to be promoted.
 *
 * Deleting the default leaves the book without one, so a survivor is promoted.
 * Deleting a non-default changes nothing.
 */
export function requiresPromotionAfterDelete(
  wasDefault: boolean,
  remainingCount: number,
): boolean {
  return wasDefault && remainingCount > 0;
}
