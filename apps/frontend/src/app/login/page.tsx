'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLogin } from '@/features/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { AuthPanel } from '@/components/auth/auth-panel';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Where to go afterwards. Someone sent here by the checkout guard should land
   * back in checkout, not on the home page having lost their place.
   *
   * Only relative paths are honoured: accepting an absolute URL here would make
   * this an open redirect, which is how a phishing link gets to wear your
   * domain in the address bar.
   */
  const redirectTo = params.get('next');
  const safeRedirect = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => router.push(safeRedirect) },
    );
  };

  return (
    <AuthPanel
      title="Sign in"
      subtitle="Your cart comes with you."
      footer={
        <>
          New here?{' '}
          <Link
            href={`/register${redirectTo ? `?next=${encodeURIComponent(safeRedirect)}` : ''}`}
            className="font-medium text-indigo underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" block loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthPanel>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-24" />}>
      <LoginForm />
    </Suspense>
  );
}
