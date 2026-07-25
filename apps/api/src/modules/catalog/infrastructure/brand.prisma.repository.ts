import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { BrandSummary, IBrandRepository } from '../domain/ports/catalog.ports';

@Injectable()
export class BrandPrismaRepository implements IBrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<BrandSummary[]> {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
  }

  async exists(id: string): Promise<boolean> {
    const found = await this.prisma.brand.findUnique({ where: { id }, select: { id: true } });
    return found !== null;
  }
}
