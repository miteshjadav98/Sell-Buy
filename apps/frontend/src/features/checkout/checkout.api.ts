import { apiGet, apiPost } from '@/lib/api-client';
import type { CheckoutSummary, PlaceOrderInput, PlacedOrder } from '@/types/api';

export interface SummaryQuery {
  addressId?: string;
  couponCode?: string;
  giftWrap?: boolean;
}

export const checkoutApi = {
  summary: (query: SummaryQuery = {}): Promise<CheckoutSummary> =>
    apiGet<CheckoutSummary>('/checkout/summary', {
      params: {
        addressId: query.addressId,
        couponCode: query.couponCode,
        giftWrap: query.giftWrap,
      },
    }),

  /**
   * The `Idempotency-Key` header is the whole reason this is not a plain POST.
   *
   * A customer double-tapping "Place order", or a phone retrying a request whose
   * response was lost on a patchy connection, must not produce two orders and
   * two charges. The key is minted once per checkout attempt and reused across
   * every retry of that attempt, so the server returns the order it already
   * created instead of creating another.
   */
  placeOrder: (input: PlaceOrderInput, idempotencyKey: string): Promise<PlacedOrder> =>
    apiPost<PlacedOrder>('/checkout', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  confirmPayment: (input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }): Promise<{ orderId: string; confirmed: boolean; alreadySettled: boolean }> =>
    apiPost('/checkout/payments/confirm', input),
};

export const checkoutKeys = {
  all: ['checkout'] as const,
  summary: (query: SummaryQuery) => [...checkoutKeys.all, 'summary', query] as const,
};
