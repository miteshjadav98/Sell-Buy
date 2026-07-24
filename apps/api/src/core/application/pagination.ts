/**
 * Two pagination styles, deliberately.
 *
 * Offset pagination is fine for admin tables where a user jumps to page 47.
 * It is wrong for infinite scroll: `OFFSET 100000` makes Postgres walk and
 * discard 100 000 rows on every request, and rows inserted mid-scroll shift
 * the window so items are shown twice or skipped.
 *
 * Cursor pagination is O(1) regardless of depth and stable under concurrent
 * inserts, which is why the storefront uses it.
 */

export interface OffsetPaginationParams {
  page: number;
  limit: number;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total?: number;
    page?: number;
    limit: number;
    totalPages?: number;
    hasNext: boolean;
    nextCursor?: string;
  };
}

export function buildOffsetResult<T>(
  items: T[],
  total: number,
  { page, limit }: OffsetPaginationParams,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    items,
    meta: { total, page, limit, totalPages, hasNext: page < totalPages },
  };
}

/**
 * Fetch `limit + 1` rows and pass them here: the extra row is how we know
 * another page exists without running a second COUNT query.
 */
export function buildCursorResult<T extends { id: string }>(
  rows: T[],
  limit: number,
): PaginatedResult<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  return {
    items,
    meta: { limit, hasNext, nextCursor: hasNext ? items[items.length - 1]?.id : undefined },
  };
}
