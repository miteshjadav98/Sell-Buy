import Link from 'next/link';

/**
 * The frame both auth screens share.
 *
 * It repeats the receipt motif once — a hairline over a single reassuring
 * line — so signing in feels like part of the same product rather than a
 * bolted-on form. Nothing else here competes with the fields.
 */
export function AuthPanel({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-14">
      <div className="rise border border-rule bg-card p-7">
        <h1 className="font-display text-2xl tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>

        <div className="mt-7">{children}</div>

        <div className="mt-6 border-t border-rule pt-4 text-center text-sm text-ink-muted">
          {footer}
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-ink-faint">
        By continuing you agree to how this reference implementation handles your data.{' '}
        <Link href="/" className="underline underline-offset-4 hover:text-ink-muted">
          Back to the storefront
        </Link>
      </p>
    </div>
  );
}
