'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRegister } from '@/features/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { AuthPanel } from '@/components/auth/auth-panel';

/** Mirrors the API's rule so the reader is told before the round-trip, not after. */
const MIN_PASSWORD_LENGTH = 8;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const register = useRegister();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [touched, setTouched] = useState(false);

  const redirectTo = params.get('next');
  const safeRedirect =
    redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';

  const passwordError =
    touched && form.password.length > 0 && form.password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
      : undefined;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (form.password.length < MIN_PASSWORD_LENGTH) return;

    register.mutate(
      {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      },
      { onSuccess: () => router.push(safeRedirect) },
    );
  };

  return (
    <AuthPanel
      title="Create an account"
      subtitle="Takes a minute. Anything already in your cart carries over."
      footer={
        <>
          Already have one?{' '}
          <Link
            href={`/login${redirectTo ? `?next=${encodeURIComponent(safeRedirect)}` : ''}`}
            className="font-medium text-indigo underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <Input
              id="firstName"
              autoComplete="given-name"
              required
              value={form.firstName}
              onChange={set('firstName')}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <Input
              id="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={set('lastName')}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Mobile"
          htmlFor="phone"
          hint="Optional. Used for delivery updates from the courier."
        >
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={form.phone}
            onChange={set('phone')}
            placeholder="9876543210"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          error={passwordError}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(passwordError)}
            aria-describedby="password-description"
            value={form.password}
            onChange={set('password')}
            onBlur={() => setTouched(true)}
          />
        </Field>

        <Button type="submit" size="lg" block loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthPanel>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="py-24" />}>
      <RegisterForm />
    </Suspense>
  );
}
