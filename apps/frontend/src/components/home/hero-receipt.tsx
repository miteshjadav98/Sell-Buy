import { Money } from '@/components/ui/receipt';

/**
 * The signature element.
 *
 * Rather than asserting that pricing here is honest, the hero shows the
 * arithmetic: a ₹999 t-shirt, the GST already inside that number, delivery free
 * over ₹499, and a total that equals the listed price. It is the same
 * calculation the checkout endpoint performs, rendered as the artifact Indian
 * commerce actually runs on — a tax invoice.
 *
 * The lines print in one at a time on load, the way a receipt feeds out of a
 * printer. It is the only orchestrated motion on the site.
 */
const LINES = [
  { label: 'Cotton t-shirt', hint: 'Indigo / M', amount: 999 },
  { label: 'GST 18%', hint: 'included above', amount: 152.39, muted: true },
  { label: 'Delivery', hint: 'free over ₹499', amount: 0, free: true },
];

export function HeroReceipt() {
  return (
    <div className="w-full max-w-[19rem] border border-rule bg-card p-5 shadow-[0_1px_0_0_rgba(20,27,34,0.04),0_12px_28px_-18px_rgba(20,27,34,0.35)]">
      <div className="print-line flex items-baseline justify-between border-b border-dashed border-rule pb-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Tax invoice
        </span>
        <span className="tnum text-[11px] text-ink-faint">SB-2026-4F7K2M9Q</span>
      </div>

      <div className="py-2">
        {LINES.map((line, index) => (
          <div
            key={line.label}
            className="print-line flex items-baseline justify-between gap-3 py-1.5"
            style={{ animationDelay: `${120 + index * 110}ms` }}
          >
            <span className="min-w-0 text-sm text-ink">
              {line.label}
              <span className="ml-1.5 text-[11px] text-ink-faint">{line.hint}</span>
            </span>
            {line.free ? (
              <span className="tnum shrink-0 text-sm text-moss">Free</span>
            ) : (
              <Money
                amount={line.amount}
                className={`shrink-0 text-sm ${line.muted ? 'text-ink-faint' : 'text-ink'}`}
              />
            )}
          </div>
        ))}
      </div>

      <div
        className="print-line mt-1 border-t border-ink pt-3"
        style={{ animationDelay: '460ms' }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">You pay</span>
          <Money amount={999} className="text-xl font-semibold text-ink" />
        </div>
        <p className="mt-1.5 text-right text-[11px] leading-relaxed text-ink-faint">
          Same as the listed price.
          <br />
          Nothing added at the end.
        </p>
      </div>
    </div>
  );
}
