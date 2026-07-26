'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useCartCount } from '@/features/cart/use-cart';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';

/**
 * The wordmark sets the display face against the mono the rest of the site uses
 * for figures — "Sell" in Fraunces, "Buy" in Plex Mono, split by a hairline.
 * It is the one place the two voices of this design meet, which is why it reads
 * as a mark rather than as a heading.
 */
function Wordmark() {
  return (
    <Link href="/" className="group flex items-baseline gap-[3px]" aria-label="Sell-Buy home">
      <span className="font-display text-[22px] font-semibold tracking-tight text-ink">Sell</span>
      <span className="h-4 w-px translate-y-[1px] bg-rule-strong transition-colors group-hover:bg-indigo" />
      <span className="tnum text-[19px] font-medium tracking-tight text-indigo">Buy</span>
    </Link>
  );
}

export function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const cartCount = useCartCount();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const { openCart, mobileNavOpen, toggleMobileNav, closeMobileNav } = useUiStore();

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : '/products');
    closeMobileNav();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <button
          onClick={toggleMobileNav}
          className="-ml-2 grid h-9 w-9 place-items-center rounded-[--radius-card] text-ink-muted hover:bg-indigo-wash hover:text-indigo md:hidden"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Wordmark />

        <form onSubmit={submitSearch} className="ml-2 hidden flex-1 md:block" role="search">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search products"
              aria-label="Search products"
              className="h-9 w-full rounded-[--radius-card] border border-rule-strong bg-card pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15"
            />
          </div>
        </form>

        <nav className="ml-auto flex items-center gap-1">
          <Link
            href="/products"
            className="hidden rounded-[--radius-card] px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-indigo-wash hover:text-indigo md:block"
          >
            Browse
          </Link>

          {/* Held blank until the session resolves — a "Sign in" link that
              flips to a name half a second later reads as a glitch. */}
          {ready &&
            (user ? (
              <Link
                href="/account"
                className="flex items-center gap-2 rounded-[--radius-card] px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-indigo-wash hover:text-indigo"
              >
                <User className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{user.fullName.split(' ')[0]}</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded-[--radius-card] px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-indigo-wash hover:text-indigo"
              >
                Sign in
              </Link>
            ))}

          <button
            onClick={openCart}
            className="relative grid h-9 w-9 place-items-center rounded-[--radius-card] text-ink transition-colors hover:bg-indigo-wash hover:text-indigo"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="h-5 w-5" aria-hidden />
            {cartCount > 0 && (
              <span className="tnum absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-indigo px-1 text-[10px] font-medium text-white">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {mobileNavOpen && (
        <div className="border-t border-rule bg-card px-4 py-4 md:hidden">
          <form onSubmit={submitSearch} role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Search products"
                aria-label="Search products"
                className="h-10 w-full rounded-[--radius-card] border border-rule-strong bg-paper pl-9 pr-3 text-sm focus:border-indigo focus:outline-none"
              />
            </div>
          </form>
          <div className="mt-3 flex flex-col">
            {[
              { href: '/products', label: 'Browse everything' },
              { href: '/cart', label: 'Cart' },
              { href: '/account', label: 'Account' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileNav}
                className={cn(
                  'border-b border-rule py-3 text-sm text-ink last:border-0',
                  'transition-colors hover:text-indigo',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
