'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label, control, and the one line that explains what went wrong.
 *
 * The error is wired to the control with `aria-describedby` and announced
 * politely, because a validation message that is only red is a message blind
 * users never receive. Hint and error occupy the same slot — an error replaces
 * the hint rather than stacking, so the field never grows and shoves the form
 * around underneath someone's cursor.
 */
export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-vermilion" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && (
        <p
          id={`${htmlFor}-description`}
          role={error ? 'alert' : undefined}
          className={cn('text-xs', error ? 'text-vermilion' : 'text-ink-faint')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 w-full rounded-[--radius-card] border bg-card px-3 text-sm text-ink',
          'placeholder:text-ink-faint transition-colors',
          'focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15',
          invalid ? 'border-vermilion' : 'border-rule-strong',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full appearance-none rounded-[--radius-card] border border-rule-strong bg-card',
          'px-3 text-sm text-ink transition-colors',
          'focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-[--radius-card] border border-rule-strong bg-card px-3 py-2 text-sm text-ink',
          'placeholder:text-ink-faint transition-colors',
          'focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/15',
          className,
        )}
        {...props}
      />
    );
  },
);

/** Generates a stable id for a label/control pair without hand-managed strings. */
export function useFieldId(prefix: string): string {
  const id = useId();
  return `${prefix}-${id}`;
}
