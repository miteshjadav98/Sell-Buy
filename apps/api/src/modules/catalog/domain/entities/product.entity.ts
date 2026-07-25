import { ProductStatus } from '@prisma/client';
import { BaseEntity } from '../../../../core/domain/base.entity';
import { Result, fail, ok } from '../../../../core/domain/result';

/**
 * A lightweight snapshot of a variant, carried so the aggregate can answer
 * questions about itself ("is this sellable?", "what does it cost?") without a
 * second query. Price is the decimal rupee amount as stored.
 */
export interface ProductVariantSnapshot {
  id: string;
  price: number;
  isActive: boolean;
}

export interface ProductProps {
  sellerId: string;
  categoryId: string;
  brandId: string | null;
  title: string;
  slug: string;
  description: string;
  status: ProductStatus;
  publishedAt: Date | null;
  variants: ProductVariantSnapshot[];
}

/**
 * The Product aggregate — where the listing lifecycle is actually decided.
 *
 * A product does not go live because a controller set a column; it goes live
 * because it satisfied the rules encoded here. Those rules ("a seller may not
 * submit a product with no priced variant", "only a pending product can be
 * approved") are true no matter who triggers the change — the seller dashboard,
 * a bulk import, an admin tool, a test — so they live on the entity, not in any
 * one use case.
 *
 * The transition methods return a Result rather than throwing: a rejected
 * transition is a normal business answer, and returning it forces the calling
 * use case to decide what the client is told.
 */
export class Product extends BaseEntity<string> {
  private constructor(
    id: string,
    private props: ProductProps,
  ) {
    super(id);
  }

  static hydrate(id: string, props: ProductProps): Product {
    return new Product(id, props);
  }

  get sellerId(): string {
    return this.props.sellerId;
  }
  get title(): string {
    return this.props.title;
  }
  get slug(): string {
    return this.props.slug;
  }
  get status(): ProductStatus {
    return this.props.status;
  }
  get categoryId(): string {
    return this.props.categoryId;
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }

  /** Only the seller who owns a product may manage it (checked in the use case). */
  isOwnedBy(sellerId: string): boolean {
    return this.props.sellerId === sellerId;
  }

  private hasSellableVariant(): boolean {
    return this.props.variants.some((v) => v.isActive && v.price > 0);
  }

  /** Buyers may only ever reach an ACTIVE product that still has a live variant. */
  isPurchasable(): boolean {
    return this.props.status === ProductStatus.ACTIVE && this.hasSellableVariant();
  }

  /**
   * The visible price band on a listing card. Null when nothing is sellable,
   * which is the signal to render "unavailable" rather than "₹0".
   */
  priceRange(): { min: number; max: number } | null {
    const prices = this.props.variants.filter((v) => v.isActive).map((v) => v.price);
    if (prices.length === 0) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }

  /**
   * A seller submitting a draft for review. Everything a human reviewer needs to
   * see must already be present — catching an empty description here is far
   * cheaper than a reviewer bouncing it back a day later.
   */
  submitForReview(): Result<void> {
    if (this.props.status !== ProductStatus.DRAFT && this.props.status !== ProductStatus.REJECTED) {
      return fail(`A ${this.props.status} product cannot be submitted for review.`);
    }
    if (this.props.title.trim().length === 0) {
      return fail('Add a title before submitting.');
    }
    if (this.props.description.trim().length < 20) {
      return fail('Add a description of at least 20 characters before submitting.');
    }
    if (!this.hasSellableVariant()) {
      return fail('Add at least one active variant with a price before submitting.');
    }
    this.props.status = ProductStatus.PENDING_APPROVAL;
    return ok(undefined);
  }

  /** Admin approves a pending product — this is the only path to ACTIVE. */
  approve(): Result<void> {
    if (this.props.status !== ProductStatus.PENDING_APPROVAL) {
      return fail(`Only a product awaiting approval can be approved (this one is ${this.props.status}).`);
    }
    this.props.status = ProductStatus.ACTIVE;
    this.props.publishedAt ??= new Date();
    return ok(undefined);
  }

  /** Admin rejects a pending product back to the seller to fix. */
  reject(): Result<void> {
    if (this.props.status !== ProductStatus.PENDING_APPROVAL) {
      return fail(`Only a product awaiting approval can be rejected (this one is ${this.props.status}).`);
    }
    this.props.status = ProductStatus.REJECTED;
    return ok(undefined);
  }

  /** Seller pulls a live product off the shelf without deleting it. */
  deactivate(): Result<void> {
    if (this.props.status !== ProductStatus.ACTIVE) {
      return fail('Only an active product can be deactivated.');
    }
    this.props.status = ProductStatus.INACTIVE;
    return ok(undefined);
  }

  /** Seller re-lists a previously active product. No re-approval needed. */
  reactivate(): Result<void> {
    if (this.props.status !== ProductStatus.INACTIVE) {
      return fail('Only an inactive product can be reactivated.');
    }
    this.props.status = ProductStatus.ACTIVE;
    return ok(undefined);
  }
}
