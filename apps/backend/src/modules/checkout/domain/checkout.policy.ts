/**
 * The handful of numbers that decide how checkout behaves, in one place rather
 * than scattered as literals through four use cases.
 */

/**
 * How long an unpaid order may hold its stock.
 *
 * The window exists because a customer who opens the gateway page and wanders
 * off must not consume inventory forever — but it cannot be so short that a
 * genuine buyer typing an OTP loses their order underneath them. Fifteen minutes
 * comfortably outlives every gateway's own session timeout.
 */
export const RESERVATION_TTL_MINUTES = 15;

/** Distinct lines allowed in a single order — a sanity bound, not a business rule. */
export const MAX_LINES_PER_ORDER = 50;

/** Flat gift-wrap charge, in minor units (₹49). */
export const GIFT_WRAP_FEE_MINOR = 4_900;

/** Orders are placed in this currency; multi-currency is out of scope for now. */
export const ORDER_CURRENCY = 'INR';

/**
 * Statuses from which an order may still be expired by the sweeper. Anything
 * further along has either been paid for or already cancelled.
 */
export const EXPIRABLE_STATUSES = ['PENDING_PAYMENT'] as const;
