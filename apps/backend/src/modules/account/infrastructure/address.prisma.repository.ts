import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  AddressInput,
  AddressRecord,
  IAddressRepository,
  TxContext,
} from '../domain/ports/address.ports';

const SELECT = {
  id: true,
  type: true,
  fullName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

@Injectable()
export class AddressPrismaRepository implements IAddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TxContext): Prisma.TransactionClient | PrismaService {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  async listForUser(userId: string): Promise<AddressRecord[]> {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });
  }

  async findOwned(userId: string, addressId: string): Promise<AddressRecord | null> {
    return this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      select: SELECT,
    });
  }

  async countForUser(userId: string, tx?: TxContext): Promise<number> {
    return this.client(tx).address.count({ where: { userId, deletedAt: null } });
  }

  async create(
    tx: TxContext,
    userId: string,
    input: AddressInput,
    isDefault: boolean,
  ): Promise<AddressRecord> {
    return this.client(tx).address.create({
      data: {
        userId,
        type: input.type,
        fullName: input.fullName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        landmark: input.landmark ?? null,
        city: input.city,
        state: input.state,
        country: input.country ?? 'India',
        postalCode: input.postalCode,
        isDefault,
      },
      select: SELECT,
    });
  }

  async update(
    tx: TxContext,
    userId: string,
    addressId: string,
    input: AddressInput,
  ): Promise<AddressRecord | null> {
    /**
     * `updateMany` rather than `update`, because it takes a full WHERE clause.
     * `update` only accepts a unique field, which would mean fetching by id and
     * checking the owner afterwards — the fetch-then-verify shape this
     * repository exists to make unavailable. A count of zero means "not theirs
     * or not there", and the caller turns that into a 404.
     */
    const result = await this.client(tx).address.updateMany({
      where: { id: addressId, userId, deletedAt: null },
      data: {
        type: input.type,
        fullName: input.fullName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        landmark: input.landmark ?? null,
        city: input.city,
        state: input.state,
        country: input.country ?? 'India',
        postalCode: input.postalCode,
      },
    });

    if (result.count === 0) return null;

    return this.client(tx).address.findFirst({
      where: { id: addressId, userId },
      select: SELECT,
    });
  }

  async softDelete(tx: TxContext, userId: string, addressId: string): Promise<boolean> {
    const result = await this.client(tx).address.updateMany({
      where: { id: addressId, userId, deletedAt: null },
      // Cleared as it goes, so a soft-deleted row can never be the row that
      // still holds the default flag.
      data: { deletedAt: new Date(), isDefault: false },
    });
    return result.count > 0;
  }

  async clearDefault(tx: TxContext, userId: string): Promise<void> {
    await this.client(tx).address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  async markDefault(tx: TxContext, userId: string, addressId: string): Promise<boolean> {
    const result = await this.client(tx).address.updateMany({
      where: { id: addressId, userId, deletedAt: null },
      data: { isDefault: true },
    });
    return result.count > 0;
  }

  async findPromotionCandidate(
    tx: TxContext,
    userId: string,
    excludingId: string,
  ): Promise<AddressRecord | null> {
    return this.client(tx).address.findFirst({
      where: { userId, deletedAt: null, id: { not: excludingId } },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
  }
}
