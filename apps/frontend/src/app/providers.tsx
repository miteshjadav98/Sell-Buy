'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, bootstrapSession } from '@/lib/api-client';
import { authApi } from '@/features/auth/auth.api';
import { registerAuthTeardown, useAuthStore } from '@/store/auth.store';

/**
 * One QueryClient per browser session, created inside state.
 *
 * Creating it at module scope would share it across every request on the
 * server, which in a multi-user deployment means one customer's cart being
 * served to another — the worst possible cache bug and an easy one to write.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // The window regaining focus is not evidence the data changed, and a
        // refetch storm on every tab switch is a cost with no benefit here.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a 4xx just repeats a question already answered. Only
          // genuine transport and server failures are worth a second attempt.
          if (error instanceof ApiError && error.isActionable) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/**
 * Restores the session before the app renders anything that depends on it.
 *
 * The access token died with the previous page; the httpOnly refresh cookie did
 * not. So on every load we ask the server who this is. Until that settles,
 * `ready` is false and auth-gated UI holds still rather than flashing a
 * signed-out state at someone who is signed in.
 */
function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setReady = useAuthStore((s) => s.setReady);

  useEffect(() => {
    let cancelled = false;
    registerAuthTeardown();

    (async () => {
      const restored = await bootstrapSession();
      if (cancelled) return;

      if (!restored) {
        setReady(true);
        return;
      }

      try {
        const user = await authApi.me();
        if (!cancelled) setUser(user);
      } catch {
        // A valid refresh token whose user we cannot load is a signed-out state
        // as far as the UI is concerned.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setUser, setReady]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap>{children}</SessionBootstrap>
    </QueryClientProvider>
  );
}
