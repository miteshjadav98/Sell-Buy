'use client';

import { RequireAuth } from '@/components/auth/require-auth';
import { CheckoutFlow } from './checkout-flow';

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutFlow />
    </RequireAuth>
  );
}
