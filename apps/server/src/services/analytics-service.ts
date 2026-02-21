import { db, events } from '../db/index.js';
import { redis, REDIS_KEYS } from '../lib/redis.js';
import { sql, desc, lt, eq, and, or, gte, lte } from 'drizzle-orm';
import type { PromptAnalysis } from '@ai-cost-profiler/shared';
import type { PromptAnalysisRow } from './types/analytics-query-result-types.js';
import {
  decodeCursor,
  formatPaginatedResponse,
  parseLimit,
  type PaginatedResponse,
} from '../utils/pagination.js';
import type { Event } from '../db/schema.js';

// Re-export split services for backward compatibility
export { getCostBreakdown } from './cost-breakdown-service.js';
export { getFlamegraphData } from './flamegraph-service.js';
export { getTimeseries } from './timeseries-service.js';

/**
 * Get prompt analysis with bloat detection
 */
export async function getPromptAnalysis(
  from: string,
  to: string
): Promise<PromptAnalysis[]> {
  const medianResult = await db.execute(sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY input_tokens) as median_tokens
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
  `);

  const medianTokens = Number((medianResult.rows[0] as Record<string, unknown>).median_tokens || '0');
  const bloatThreshold = Math.floor(medianTokens * 1.5);

  const result = await db.execute(sql`
    SELECT
      SUBSTRING(metadata::text, 1, 100) as content,
      MD5(metadata::text) as prompt_hash,
      COUNT(*) as occurrences,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as total_cost_usd,
      AVG(input_tokens + output_tokens) as avg_tokens
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
      AND input_tokens > ${bloatThreshold}
      AND metadata IS NOT NULL
    GROUP BY MD5(metadata::text), SUBSTRING(metadata::text, 1, 100)
    ORDER BY total_cost_usd DESC
    LIMIT 20
  `);

  return (result.rows as PromptAnalysisRow[]).map((row) => ({
    promptHash: row.prompt_hash,
    content: row.content,
    occurrences: Number(row.occurrences),
    totalCostUsd: Number(row.total_cost_usd),
    avgTokens: Number(row.avg_tokens),
    similarPrompts: [],
  }));
}

/**
 * Get paginated events list
 */
export async function getEventsList(
  from: string,
  to: string,
  cursor?: string,
  limit: string = '50',
  filters?: {
    feature?: string;
    model?: string;
    provider?: string;
  }
): Promise<PaginatedResponse<Event>> {
  const parsedLimit = parseLimit(limit, 50, 200);

  const conditions = [
    gte(events.createdAt, new Date(from)),
    lte(events.createdAt, new Date(to)),
  ];

  if (filters?.feature) conditions.push(eq(events.feature, filters.feature));
  if (filters?.model) conditions.push(eq(events.model, filters.model));
  if (filters?.provider) conditions.push(eq(events.provider, filters.provider));

  if (cursor) {
    const { timestamp, id } = decodeCursor(cursor);
    conditions.push(
      or(
        lt(events.createdAt, new Date(timestamp)),
        and(
          eq(events.createdAt, new Date(timestamp)),
          lt(events.id, id)
        )
      )!
    );
  }

  const results = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(parsedLimit + 1);

  return formatPaginatedResponse(results, parsedLimit);
}

/**
 * Get real-time totals from Redis
 */
export async function getRealtimeTotals(): Promise<{
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
}> {
  const [cost, requests, tokens] = await Promise.all([
    redis.get(REDIS_KEYS.TOTAL_COST),
    redis.get(REDIS_KEYS.TOTAL_REQUESTS),
    redis.get(REDIS_KEYS.TOTAL_TOKENS),
  ]);

  return {
    totalCost: parseFloat(cost || '0'),
    totalRequests: parseInt(requests || '0'),
    totalTokens: parseInt(tokens || '0'),
  };
}
