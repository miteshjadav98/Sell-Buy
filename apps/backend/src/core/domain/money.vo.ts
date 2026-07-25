/**
 * Money as a value object, stored in the smallest currency unit (paise/cents).
 *
 * Floating point cannot represent 0.1 exactly, so `0.1 + 0.2 !== 0.3`. Run that
 * through a few million orders and the books do not balance. Integers of the
 * minor unit make arithmetic exact.
 *
 * Value objects are immutable and compared by value: two Money objects of 100
 * INR are interchangeable, unlike two Orders with the same total.
 */
export class Money {
  private constructor(
    public readonly minorUnits: number,
    public readonly currency: string,
  ) {
    if (!Number.isInteger(minorUnits)) {
      throw new Error('Money must be constructed from an integer of minor units');
    }
  }

  static fromMinor(minorUnits: number, currency = 'INR'): Money {
    return new Money(minorUnits, currency);
  }

  /** Accepts a decimal amount (12.34) and rounds half-up to the minor unit. */
  static fromDecimal(amount: number | string, currency = 'INR'): Money {
    const value = typeof amount === 'string' ? Number(amount) : amount;
    if (Number.isNaN(value)) throw new Error(`Invalid money amount: ${amount}`);
    return new Money(Math.round(value * 100), currency);
  }

  static zero(currency = 'INR'): Money {
    return new Money(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.minorUnits * factor), this.currency);
  }

  /** Percentage of this amount, e.g. tax or a discount rate. */
  percentage(percent: number): Money {
    return new Money(Math.round((this.minorUnits * percent) / 100), this.currency);
  }

  /** Never let a discount push a total below zero. */
  clampToZero(): Money {
    return this.minorUnits < 0 ? Money.zero(this.currency) : this;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  equals(other: Money): boolean {
    return this.minorUnits === other.minorUnits && this.currency === other.currency;
  }

  /** Decimal representation for persistence and API responses. */
  toDecimal(): number {
    return this.minorUnits / 100;
  }

  toString(): string {
    return `${this.currency} ${this.toDecimal().toFixed(2)}`;
  }
}
