import { cn } from '@/lib/utils';
import { discountPercent, formatMoney, formatMoneyCompact } from '@/lib/format';

/**
 * The signature of this interface.
 *
 * Money gets exactly one treatment everywhere it appears — product card, cart
 * line, checkout summary, order confirmation — set in tabular figures and
 * right-aligned so digits stack in a column. Once a reader learns that a
 * monospaced right-aligned figure is a rupee amount, they never have to work it
 * out again, and totals become scannable instead of readable.
 *
 * The hairline above a total is used only above a total. That restraint is what
 * makes it mean something: a rule on this site says "the figures above this were
 * summed", not "a section ended".
 */

export function Money({
  amount,
  className,
  compact,
  strike,
}: {
  amount: number;
  className?: string;
  /** Drops ".00" — for dense contexts like product cards. */
  compact?: boolean;
  strike?: boolean;
}) {
  return (
    <span
      className={cn(
        'tnum',
        strike && 'text-ink-faint line-through decoration-ink-faint/60',
        className,
      )}
    >
      {compact ? formatMoneyCompact(amount) : formatMoney(amount)}
    </span>
  );
}

/** Live price beside the struck-through MRP and the saving, in that reading order. */
export function PriceBlock({
  price,
  compareAt,
  size = 'md',
  className,
}: {
  price: number;
  compareAt?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const off = discountPercent(price, compareAt ?? null);

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <Money
        amount={price}
        compact
        className={cn(
          'font-medium text-ink',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-2xl',
        )}
      />
      {off !== null && compareAt != null && (
        <>
          <Money
            amount={compareAt}
            compact
            strike
            className={size === 'lg' ? 'text-sm' : 'text-xs'}
          />
          {/* Vermilion appears here and, by rule, nowhere else on the site. */}
          <span
            className={cn(
              'tnum font-medium text-vermilion',
              size === 'lg' ? 'text-sm' : 'text-xs',
            )}
          >
            {off}% off
          </span>
        </>
      )}
    </div>
  );
}

/** One line of a receipt: what it is on the left, what it costs on the right. */
export function ReceiptRow({
  label,
  hint,
  amount,
  tone = 'default',
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  amount?: number;
  tone?: 'default' | 'muted' | 'credit';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <span
          className={cn(
            'text-sm',
            tone === 'muted' ? 'text-ink-muted' : 'text-ink',
            tone === 'credit' && 'text-vermilion',
          )}
        >
          {label}
        </span>
        {hint && <span className="ml-2 text-xs text-ink-faint">{hint}</span>}
      </div>

      {children ?? (
        amount !== undefined && (
          <Money
            amount={tone === 'credit' ? -Math.abs(amount) : amount}
            className={cn(
              'shrink-0 text-sm',
              tone === 'credit' ? 'text-vermilion' : 'text-ink',
              tone === 'muted' && 'text-ink-muted',
            )}
          />
        )
      )}
    </div>
  );
}

/**
 * The grand total, with the rule above it.
 *
 * `note` carries the GST line. Under inclusive pricing the tax is already inside
 * this number, and saying so plainly — rather than hiding it or, worse, adding
 * it again — is the entire promise this design is built around.
 */
export function ReceiptTotal({
  label = 'Total',
  amount,
  note,
}: {
  label?: string;
  amount: number;
  note?: React.ReactNode;
}) {
  return (
    <div className="mt-1 border-t border-ink pt-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold tracking-tight text-ink">{label}</span>
        <Money amount={amount} className="text-lg font-semibold text-ink" />
      </div>
      {note && <p className="mt-1 text-right text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

/** The dotted tear-off edge that closes a receipt panel. */
export function ReceiptEdge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'h-2 w-full bg-[radial-gradient(circle_at_4px_0,transparent_4px,currentColor_4px)]',
        'bg-[length:8px_8px] text-card',
        className,
      )}
    />
  );
}
