/**
 * Specification.
 *
 * A rule that can answer "does this candidate satisfy me?" and, when it does
 * not, say why in words a customer can read. Rules are objects rather than
 * branches so they can be named, tested one at a time, and recombined — the
 * eligibility check for a coupon at checkout is the same set of rules the admin
 * panel will use to preview who a campaign reaches.
 *
 * The `reason` is part of the contract. A boolean alone forces the caller to
 * reconstruct the explanation with the very `if` chain the pattern removed.
 */
export interface ISpecification<T> {
  /** Why this rule refuses, phrased for the person who will read it. */
  readonly reason: string;
  isSatisfiedBy(candidate: T): boolean;
}

/**
 * All rules must hold. Composite, so a group of rules is itself a rule and
 * nothing that consumes one needs to know which it got.
 */
export class AndSpecification<T> implements ISpecification<T> {
  constructor(private readonly specifications: ReadonlyArray<ISpecification<T>>) {}

  /**
   * Reports the FIRST unmet rule rather than every one.
   *
   * Deliberate: telling a shopper "expired, and you have used it, and your cart
   * is too small" is noise. Order the rules so the most actionable failure comes
   * first and the message is the one thing they can do something about.
   */
  firstUnsatisfiedBy(candidate: T): ISpecification<T> | null {
    return this.specifications.find((spec) => !spec.isSatisfiedBy(candidate)) ?? null;
  }

  get reason(): string {
    return 'One or more conditions were not met';
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.firstUnsatisfiedBy(candidate) === null;
  }
}

export class NotSpecification<T> implements ISpecification<T> {
  constructor(
    private readonly specification: ISpecification<T>,
    readonly reason: string,
  ) {}

  isSatisfiedBy(candidate: T): boolean {
    return !this.specification.isSatisfiedBy(candidate);
  }
}

export const allOf = <T>(...specifications: ISpecification<T>[]): AndSpecification<T> =>
  new AndSpecification(specifications);
