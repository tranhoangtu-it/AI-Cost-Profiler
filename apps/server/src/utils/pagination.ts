/**
 * Cursor-based pagination utilities for efficient large dataset queries
 */

export interface PaginationCursor {
  timestamp: number;
  id: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Encode cursor to base64 string
 */
export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from base64 string
 */
export function decodeCursor(encoded: string): PaginationCursor {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      timestamp: parsed.timestamp,
      id: parsed.id,
    };
  } catch (error) {
    throw new Error('Invalid cursor format');
  }
}

/**
 * Format paginated response with cursor metadata
 * Fetches limit+1 items to determine hasMore
 */
export function formatPaginatedResponse<T extends { createdAt: Date; id: string }>(
  data: T[],
  limit: number
): PaginatedResponse<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? encodeCursor({
        timestamp: lastItem.createdAt.getTime(),
        id: lastItem.id,
      })
    : null;

  return {
    data: items,
    pagination: {
      nextCursor,
      hasMore,
    },
  };
}

/**
 * Validate and parse limit parameter
 */
export function parseLimit(limit: string | undefined, defaultLimit = 50, maxLimit = 200): number {
  if (!limit) return defaultLimit;

  const parsed = parseInt(limit, 10);
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  if (parsed > maxLimit) return maxLimit;

  return parsed;
}
