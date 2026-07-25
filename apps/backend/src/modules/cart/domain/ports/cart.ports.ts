/**
 * Ports for the cart feature. Reads and writes of the cart itself sit behind
 * CART_REPOSITORY; the two things the cart needs *about* the catalogue — a
 * variant's live price and its available stock — are separate one-purpose ports,
 * so the cart never reaches into the catalog or inventory tables directly and
 * each can later become a remote call without the cart noticing.
 */

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');
export const VARIANT_PRICING_READER = Symbol('VARIANT_PRICING_READER');
export const INVENTORY_READER = Symbol('INVENTORY_READER');

/**
 * Who a cart belongs to. Exactly one field is set: a signed-in shopper is keyed
 * by userId, a guest by an opaque sessionId held in a cookie. Login merges the
 * second into the first.
 */
export interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

/** A cart line as stored, joined to just enough catalogue data to render it. */
export interface CartLineRaw {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  title: string;
  variantName: string;
  imageUrl: string | null;
  /** Live price now. */
  unitPrice: number;
  compareAtPrice: number | null;
  /** Price when the line was added — drives the "price changed" notice. */
  priceSnapshot: number;
  quantity: number;
  savedForLater: boolean;
  /** Variant active AND parent product live AND not soft-deleted. */
  purchasable: boolean;
}

export interface ICartRepository {
  /** The active cart's id for this identity, created on first use. */
  getOrCreateActiveCartId(identity: CartIdentity): Promise<string>;
  /** The active cart's id, or null — used by merge, which must not create one. */
  findActiveCartId(identity: CartIdentity): Promise<string | null>;

  getLines(cartId: string): Promise<CartLineRaw[]>;
  findItem(cartId: string, itemId: string): Promise<{ variantId: string; quantity: number } | null>;
  findItemByVariant(cartId: string, variantId: string): Promise<{ itemId: string; quantity: number } | null>;

  /** Insert the line, or overwrite an existing line's quantity for that variant. */
  upsertItem(cartId: string, variantId: string, quantity: number, priceSnapshot: number): Promise<void>;
  /** Set a known line's quantity. False if the item is not in this cart. */
  setItemQuantity(cartId: string, itemId: string, quantity: number): Promise<boolean>;
  removeItem(cartId: string, itemId: string): Promise<boolean>;
  setSavedForLater(cartId: string, itemId: string, saved: boolean): Promise<boolean>;
  /** Remove active lines (a "clear cart" that leaves saved-for-later alone). */
  clearActiveItems(cartId: string): Promise<void>;
  deleteCart(cartId: string): Promise<void>;
}

/** A variant's identity and price, for validating and snapshotting an add. */
export interface VariantPricing {
  variantId: string;
  productId: string;
  productSlug: string;
  title: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  /** False if the variant is inactive or its product is not live. */
  purchasable: boolean;
}

export interface IVariantPricingReader {
  find(variantId: string): Promise<VariantPricing | null>;
}

/**
 * Available stock = on-hand − reserved, summed across every warehouse holding a
 * variant. Reserved (committed to unpaid orders) is subtracted so two shoppers
 * cannot both add the last unit; the batch form powers the cart view in one
 * round-trip instead of one query per line.
 */
export interface IInventoryReader {
  available(variantId: string): Promise<number>;
  availableMany(variantIds: string[]): Promise<Map<string, number>>;
}
