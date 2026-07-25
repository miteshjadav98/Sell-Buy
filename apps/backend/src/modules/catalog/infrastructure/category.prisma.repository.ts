import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import {
  CategoryNode,
  CreateCategoryData,
  ICategoryRepository,
} from '../domain/ports/catalog.ports';

/**
 * Categories change rarely and are read on nearly every page (the nav menu), so
 * the assembled tree is cached and the cache is busted on any write.
 *
 * The tree is built in application memory from one flat `findMany` rather than a
 * recursive query: the whole active set is small (hundreds, not millions) and
 * one query plus an O(n) assembly beats N round-trips down the hierarchy.
 */
@Injectable()
export class CategoryPrismaRepository implements ICategoryRepository {
  private static readonly TREE_CACHE_KEY = 'catalog:category-tree';
  private static readonly TREE_CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getTree(): Promise<CategoryNode[]> {
    return this.redis.remember(
      CategoryPrismaRepository.TREE_CACHE_KEY,
      CategoryPrismaRepository.TREE_CACHE_TTL,
      async () => {
        const rows = await this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: [{ level: 'asc' }, { position: 'asc' }],
          select: {
            id: true,
            parentId: true,
            name: true,
            slug: true,
            imageUrl: true,
            iconUrl: true,
          },
        });

        const nodes = new Map<string, CategoryNode>();
        for (const r of rows) {
          nodes.set(r.id, { ...r, children: [] });
        }

        const roots: CategoryNode[] = [];
        for (const r of rows) {
          const node = nodes.get(r.id)!;
          const parent = r.parentId ? nodes.get(r.parentId) : undefined;
          // Rows are ordered by level, so a parent is always placed before its
          // children — but guard anyway: an inactive parent leaves the child a root.
          if (parent) parent.children.push(node);
          else roots.push(node);
        }
        return roots;
      },
    );
  }

  async findBySlug(slug: string): Promise<{ id: string; name: string; path: string } | null> {
    return this.prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, path: true },
    });
  }

  async findById(
    id: string,
  ): Promise<{ id: string; parentId: string | null; path: string; level: number } | null> {
    return this.prisma.category.findUnique({
      where: { id },
      select: { id: true, parentId: true, path: true, level: true },
    });
  }

  /**
   * `path` and `level` are materialised on write so the read path stays a single
   * indexed prefix scan. Root: path = "/slug", level 0. Child: parent.path +
   * "/slug", parent.level + 1.
   */
  async create(data: CreateCategoryData): Promise<CategoryNode> {
    const parent = data.parentId ? await this.findById(data.parentId) : null;
    const path = parent ? `${parent.path}/${data.slug}` : `/${data.slug}`;
    const level = parent ? parent.level + 1 : 0;

    const row = await this.prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        parentId: data.parentId ?? null,
        path,
        level,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        iconUrl: data.iconUrl ?? null,
      },
      select: { id: true, name: true, slug: true, imageUrl: true, iconUrl: true },
    });

    await this.redis.del(CategoryPrismaRepository.TREE_CACHE_KEY);
    return { ...row, children: [] };
  }

  async slugExists(slug: string): Promise<boolean> {
    const found = await this.prisma.category.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  }
}
