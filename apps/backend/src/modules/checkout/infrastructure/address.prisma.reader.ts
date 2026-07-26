import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DeliveryAddress, IAddressReader } from '../domain/ports/checkout.ports';

const SELECT = {
  id: true,
  fullName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
} satisfies Prisma.AddressSelect;

/**
 * Addresses, always scoped to their owner.
 *
 * Every query here carries `userId` and `deletedAt: null` in the WHERE clause
 * rather than fetching by id and checking ownership afterwards. The difference
 * matters: a check that lives in the query cannot be forgotten by the next
 * caller, and "fetch then verify" is exactly the shape that becomes an IDOR the
 * day someone adds a second call site.
 */
@Injectable()
export class AddressPrismaReader implements IAddressReader {
  constructor(private readonly prisma: PrismaService) {}

  async findOwned(userId: string, addressId: string): Promise<DeliveryAddress | null> {
    return this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      select: SELECT,
    });
  }

  async findDefault(userId: string): Promise<DeliveryAddress | null> {
    return this.prisma.address.findFirst({
      where: { userId, deletedAt: null },
      // The flagged default first, then the most recently added — so a user who
      // has never set one still gets a sensible pre-selection.
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });
  }
}
