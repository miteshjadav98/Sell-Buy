import { CartLineRaw } from '../domain/ports/cart.ports';

/**
 * The rendered view of one cart line: the stored line plus everything computed
 * from it and from live stock. These derived fields are why the cart is assembled
 * in the application layer — a line total, a "price changed" flag or a stock
 * shortfall is a decision about presentation, not a column to store.
 */
export interface CartLineView extends CartLineRaw {
  lineTotal: number;
  lineSavings: number;
  available: number;
  inStock: boolean;
  /** Quantity in the cart is now higher than what's in stock. */
  exceedsStock: boolean;
  /** Live price differs from the price when this line was added. */
  priceChanged: boolean;
}

export interface CartView {
  cartId: string;
  items: CartLineView[];
  savedForLater: CartLineView[];
  summary: {
    distinctItems: number;
    totalQuantity: number;
    subtotal: number;
    totalMrp: number;
    totalSavings: number;
    /**
     * True if anything would block a clean checkout — an unavailable item, a
     * stock shortfall, or a price that moved. The UI shows a banner; checkout
     * (Step 8) re-validates regardless, because this snapshot can go stale.
     */
    hasIssues: boolean;
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function toLineView(line: CartLineRaw, available: number): CartLineView {
  const lineTotal = round2(line.unitPrice * line.quantity);
  const mrp = line.compareAtPrice ?? line.unitPrice;
  return {
    ...line,
    lineTotal,
    lineSavings: round2(Math.max(0, mrp - line.unitPrice) * line.quantity),
    available,
    inStock: available > 0,
    exceedsStock: line.quantity > available,
    priceChanged: line.priceSnapshot !== line.unitPrice,
  };
}

/**
 * Assembles the full cart view from raw lines and a variant→available-stock map.
 * Pure and synchronous: the I/O (loading lines, reading stock) happens in the
 * query service that calls this, which keeps the arithmetic trivially testable.
 */
export function buildCartView(
  cartId: string,
  lines: CartLineRaw[],
  stock: Map<string, number>,
): CartView {
  const active: CartLineView[] = [];
  const saved: CartLineView[] = [];

  for (const line of lines) {
    const view = toLineView(line, stock.get(line.variantId) ?? 0);
    (line.savedForLater ? saved : active).push(view);
  }

  const subtotal = round2(active.reduce((sum, l) => sum + l.lineTotal, 0));
  const totalMrp = round2(
    active.reduce((sum, l) => sum + (l.compareAtPrice ?? l.unitPrice) * l.quantity, 0),
  );

  return {
    cartId,
    items: active,
    savedForLater: saved,
    summary: {
      distinctItems: active.length,
      totalQuantity: active.reduce((sum, l) => sum + l.quantity, 0),
      subtotal,
      totalMrp,
      totalSavings: round2(totalMrp - subtotal),
      hasIssues: active.some(
        (l) => !l.purchasable || !l.inStock || l.exceedsStock || l.priceChanged,
      ),
    },
  };
}
