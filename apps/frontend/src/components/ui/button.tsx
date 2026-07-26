'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Buttons are square-ish (4px) rather than pill-shaped, and flat rather than
 * shadowed — the receipt this interface is modelled on has no soft edges. The
 * primary fill is indigo, the accent that carries every deliberate action on the
 * site; vermilion is deliberately absent here because it means "money saved" and
 * nothing else.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-[--radius-card] font-medium ' +
    'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 ' +
    'whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-indigo text-white hover:bg-indigo-deep',
        secondary: 'bg-ink text-paper hover:bg-ink/90',
        outline: 'border border-rule-strong bg-card text-ink hover:border-ink hover:bg-paper',
        ghost: 'text-ink-muted hover:bg-indigo-wash hover:text-indigo',
        danger: 'border border-vermilion/30 bg-vermilion-wash text-vermilion hover:bg-vermilion/10',
        link: 'text-indigo underline underline-offset-4 hover:text-indigo-deep',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-9 w-9',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      // Announced rather than merely spun: a screen reader user gets told the
      // button is working, not left with silence.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/**
 * A link that looks like a button.
 *
 * Separate from `Button` rather than a polymorphic `as` prop, because the
 * distinction is semantic and not cosmetic: something that navigates must be an
 * anchor so it can be opened in a new tab, copied, and announced as a link.
 * Wrapping a `<Link>` inside a `<button>` produces markup that does neither.
 */
export interface ButtonLinkProps
  extends React.ComponentPropsWithoutRef<typeof Link>,
    VariantProps<typeof button> {}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { className, variant, size, block, children, ...props },
  ref,
) {
  return (
    <Link ref={ref} className={cn(button({ variant, size, block }), className)} {...props}>
      {children}
    </Link>
  );
});

export { button as buttonStyles };
