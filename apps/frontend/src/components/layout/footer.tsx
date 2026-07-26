import Link from 'next/link';

/**
 * Quiet by design. The footer restates the one promise the whole interface is
 * built around, in the same mono the totals use, and then gets out of the way.
 */
export function Footer() {
  return (
    <footer className="mt-20 border-t border-rule bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-lg font-semibold text-ink">Sell</span>
              <span className="h-3.5 w-px translate-y-[1px] bg-rule-strong" />
              <span className="tnum text-base font-medium text-indigo">Buy</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              A marketplace where the price on the listing is the price on the invoice. GST
              included, delivery quoted before you pay.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-2">
            {[
              { href: '/products', label: 'Browse' },
              { href: '/cart', label: 'Cart' },
              { href: '/account', label: 'Account' },
              { href: '/account/addresses', label: 'Addresses' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-ink-muted transition-colors hover:text-indigo"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-rule pt-5">
          <p className="tnum text-xs text-ink-faint">
            Prices in INR, inclusive of GST · Built as a reference implementation
          </p>
        </div>
      </div>
    </footer>
  );
}
