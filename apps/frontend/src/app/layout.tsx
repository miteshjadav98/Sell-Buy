import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Fraunces, IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import { Providers } from './providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CartDrawer } from '@/components/layout/cart-drawer';
import { Toaster } from '@/components/layout/toaster';
import './globals.css';

/**
 * Three faces, three jobs, no overlap.
 *
 * Fraunces is a soft, slightly wonky serif used only for the wordmark and page
 * titles — enough personality to be recognisable, rare enough not to tire.
 * Inter Tight carries the interface. IBM Plex Mono carries every figure: prices,
 * quantities, SKUs, order numbers. Plex was chosen over a coding mono because it
 * is humanist enough to sit on an invoice rather than in a terminal, and because
 * its Devanagari sibling is there when this catalogue needs it.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sell-Buy — the price you see is the price you pay',
    template: '%s · Sell-Buy',
  },
  description:
    'A multi-vendor marketplace where GST is included in the listed price and delivery is quoted before you pay.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${fraunces.variable} ${interTight.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>
          {/* Skip link: the first thing keyboard and screen-reader users meet,
              so they are not walked through the whole header on every page. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[--radius-card] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
          >
            Skip to content
          </a>

          {/* The header reads search params, which needs a Suspense boundary to
              keep the rest of the tree statically renderable. */}
          <Suspense fallback={<div className="h-16 border-b border-rule" />}>
            <Header />
          </Suspense>

          <main id="main">{children}</main>

          <Footer />
          <CartDrawer />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
