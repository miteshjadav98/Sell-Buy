import { AddressType } from '@prisma/client';

/**
 * The address book's persistence contract, declared by the layer that consumes
 * it.
 *
 * Every method takes `userId` and scopes on it. That is not defensive
 * repetition — it is the authorisation model. A repository exposing
 * `findById(addressId)` invites a caller to fetch first and check ownership
 * afterwards, and the day someone adds a second call site and forgets the
 * check, it is an IDOR: anyone can read or ship to any address by guessing a
 * uuid. Putting the owner in the query makes the unsafe version unavailable.
 */

export const ADDRESS_REPOSITORY = Symbol('ADDRESS_REPOSITORY');

/** Opaque transaction handle; only the Prisma adapter knows what it is. */
export type TxContext = unknown;

export interface AddressRecord {
  id: string;
  type: AddressType;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface AddressInput {
  type: AddressType;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  country?: string;
  postalCode: string;
}

export interface IAddressRepository {
  /** Default first, then newest — the order the address picker should render. */
  listForUser(userId: string): Promise<AddressRecord[]>;

  findOwned(userId: string, addressId: string): Promise<AddressRecord | null>;

  /** Live addresses only; soft-deleted ones do not count against the cap. */
  countForUser(userId: string, tx?: TxContext): Promise<number>;

  create(
    tx: TxContext,
    userId: string,
    input: AddressInput,
    isDefault: boolean,
  ): Promise<AddressRecord>;

  update(
    tx: TxContext,
    userId: string,
    addressId: string,
    input: AddressInput,
  ): Promise<AddressRecord | null>;

  /**
   * Soft delete. The address is kept because it is referenced by history the
   * user can still see — and because "delete" on an address the courier is
   * currently holding should not destroy the record support needs to answer for
   * it. Orders themselves freeze their own copy, so this is about the address
   * book, not about order integrity.
   */
  softDelete(tx: TxContext, userId: string, addressId: string): Promise<boolean>;

  /** Clears the flag across the user's book — half of "set default" as one atomic pair. */
  clearDefault(tx: TxContext, userId: string): Promise<void>;

  markDefault(tx: TxContext, userId: string, addressId: string): Promise<boolean>;

  /** A survivor to promote when the default is deleted. */
  findPromotionCandidate(
    tx: TxContext,
    userId: string,
    excludingId: string,
  ): Promise<AddressRecord | null>;
}
