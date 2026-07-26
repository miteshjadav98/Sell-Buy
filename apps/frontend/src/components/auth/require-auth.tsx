'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { PageSpinner } from '@/components/ui/misc';

/**
 * Gates a page on being signed in, and remembers where the visitor was going.
 *
 * Two details matter here. The guard waits for `ready` — the first refresh
 * attempt settling — before deciding anything, because redirecting on the
 * initial render would bounce every signed-in user to the login screen on every
 * hard refresh. And it carries the current path as `next`, so signing in returns
 * them to the checkout they were part-way through rather than the home page.
 *
 * This is a client-side guard over a client-rendered page, not a security
 * boundary: every endpoint behind it is independently authenticated by the API.
 * Its job is to avoid showing someone a screen that can only 401.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready) return <PageSpinner label="Checking your session" />;
  if (!user) return <PageSpinner label="Taking you to sign in" />;

  return <>{children}</>;
}
