'use client';

import Link from 'next/link';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A small status chip. Tones map to meaning, never to decoration. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'indigo' | 'moss' | 'vermilion';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[--radius-chip] px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-paper text-ink-muted ring-1 ring-rule',
        tone === 'indigo' && 'bg-indigo-wash text-indigo',
        tone === 'moss' && 'bg-moss-wash text-moss',
        tone === 'vermilion' && 'bg-vermilion-wash text-vermilion',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn('h-5 w-5 animate-spin text-ink-faint', className)} aria-hidden />
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-sm text-ink-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/**
 * An empty screen is an invitation to act, not a shrug — so every one of these
 * carries the action that fills it.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      {icon && <div className="mb-4 flex justify-center text-ink-faint">{icon}</div>}
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 inline-flex h-10 items-center rounded-[--radius-card] bg-indigo px-5 text-sm font-medium text-white transition-colors hover:bg-indigo-deep"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Errors say what happened and what to do about it. They do not apologise and
 * they are never vague — "Something went wrong" tells a reader nothing they can
 * act on.
 */
export function ErrorState({
  title = 'That did not load',
  body,
  onRetry,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-[--radius-card] border border-rule bg-card p-6 text-center">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm font-medium text-indigo underline underline-offset-4 hover:text-indigo-deep"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Rating, shown only when there is one — a hollow zero-star row reads as bad, not absent. */
export function Rating({ value, count }: { value: number; count: number }) {
  if (count === 0) return <span className="text-xs text-ink-faint">No reviews yet</span>;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
      <Star className="h-3.5 w-3.5 fill-moss text-moss" aria-hidden />
      <span className="tnum font-medium text-ink">{value.toFixed(1)}</span>
      <span className="tnum text-ink-faint">({count})</span>
    </span>
  );
}

/** Skeleton block for loading grids. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[--radius-card] bg-rule/50', className)} />;
}
