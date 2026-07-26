'use client';

import Link from 'next/link';
import { ChevronRight, LogOut, MapPin, Package, User } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useLogout } from '@/features/auth/use-auth';
import { useAuthStore } from '@/store/auth.store';
import { Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

function AccountHome() {
  const user = useAuthStore((s) => s.user)!;
  const logout = useLogout();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header className="border-b border-rule pb-6">
        <h1 className="font-display text-3xl tracking-tight text-ink">{user.fullName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">{user.email}</span>
          {user.isVerified ? (
            <Badge tone="moss">Verified</Badge>
          ) : (
            <Badge tone="neutral">Email not verified</Badge>
          )}
          {user.roles.map((role) => (
            <Badge key={role} tone="indigo">
              {role.toLowerCase()}
            </Badge>
          ))}
        </div>
      </header>

      <nav className="mt-2">
        <AccountLink
          href="/account/addresses"
          icon={<MapPin className="h-4 w-4" />}
          title="Addresses"
          body="Where your orders are delivered"
        />
        {/* Listed but disabled rather than hidden: the reader learns it is
            coming instead of wondering whether they missed it. */}
        <AccountRowDisabled
          icon={<Package className="h-4 w-4" />}
          title="Orders"
          body="Order history arrives with the orders module"
        />
        <AccountRowDisabled
          icon={<User className="h-4 w-4" />}
          title="Profile"
          body="Editing your name and password is not built yet"
        />
      </nav>

      <div className="mt-8 border-t border-rule pt-6">
        <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function AccountLink({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 border-b border-rule py-4 transition-colors hover:text-indigo"
    >
      <span className="text-ink-faint">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{body}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
    </Link>
  );
}

function AccountRowDisabled({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-rule py-4 opacity-55">
      <span className="text-ink-faint">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{body}</span>
      </span>
      <Badge tone="neutral">Soon</Badge>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountHome />
    </RequireAuth>
  );
}
