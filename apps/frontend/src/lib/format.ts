/**
 * Money formatting, in one place.
 *
 * The API sends decimals (it computes in integer paise and converts at the very
 * edge), so the browser only ever formats — it never does arithmetic on money.
 * Any total shown to a customer came from the server that will also charge them.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456.00 — Indian digit grouping, which `en-US` gets wrong. */
export function formatMoney(amount: number): string {
  return INR.format(amount);
}

/** Drops the paise when they are zero, for dense contexts like product cards. */
export function formatMoneyCompact(amount: number): string {
  return Number.isInteger(amount)
    ? INR.format(amount).replace('.00', '')
    : INR.format(amount);
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** The saving as a percentage off the struck-through price. */
export function discountPercent(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`;
}
