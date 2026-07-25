import { Injectable } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ISellerLookup } from '../domain/ports/catalog.ports';

/**
 * Resolves the seller behind a signed-in user. Deliberately the only window the
 * catalog has into the sellers table — a one-method port, so when sellers grow
 * into their own module this becomes a client call and nothing else in catalog
 * moves.
 *
 * Only an APPROVED, non-deleted seller qualifies: a pending or suspended seller
 * authenticates fine but cannot touch the catalogue.
 */
@Injectable()
export class SellerLookupPrismaRepository implements ISellerLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findApprovedSellerId(userId: string): Promise<string | null> {
    const seller = await this.prisma.seller.findFirst({
      where: { userId, status: SellerStatus.APPROVED, deletedAt: null },
      select: { id: true },
    });
    return seller?.id ?? null;
  }
}
