'use client';

import { X } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';

/**
 * Toasts confirm an action in the same words the control used: "Add to cart"
 * produces "Added to cart". That consistency is how someone learns the
 * vocabulary of an interface without being taught it.
 *
 * The region is a polite live region, so a screen reader hears the confirmation
 * without having the current sentence interrupted.
 */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-4 sm:translate-x-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rise pointer-events-auto flex items-center justify-between gap-3 rounded-[--radius-card]',
            'border px-4 py-3 text-sm shadow-lg',
            toast.tone === 'error'
              ? 'border-vermilion/25 bg-vermilion-wash text-vermilion'
              : 'border-ink bg-ink text-paper',
          )}
        >
          <span className="min-w-0">{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
