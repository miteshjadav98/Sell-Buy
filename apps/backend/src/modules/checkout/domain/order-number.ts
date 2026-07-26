import { randomInt } from 'node:crypto';

/**
 * The number a customer reads down the phone: `SB-2026-4F7K2M9Q`.
 *
 * Deliberately NOT the primary key and deliberately NOT sequential. A sequential
 * public number leaks how many orders the business takes — competitors count
 * them, and anyone can enumerate `SB-2026-00000001` upward to probe for other
 * people's orders. The uuid stays internal; this is the handle for humans.
 *
 * The alphabet drops the characters people misread aloud or mistype: 0/O, 1/I/L,
 * and vowels (which also stops the generator producing words nobody wants
 * printed on an invoice).
 */
const ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 8;

export function generateOrderNumber(now: Date = new Date()): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    // Cryptographic randomness, not Math.random: this value is quoted in support
    // conversations and must not be guessable from another order's number.
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `SB-${now.getUTCFullYear()}-${suffix}`;
}

/** 28^8 ≈ 3.8 × 10^11 per year — collisions are handled by the unique index, not hoped away. */
export const ORDER_NUMBER_PATTERN = /^SB-\d{4}-[23456789BCDFGHJKMNPQRSTVWXYZ]{8}$/;
