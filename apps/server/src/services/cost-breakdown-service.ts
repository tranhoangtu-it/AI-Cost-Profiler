import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { CostBreakdownQuery, CostBreakdownItem } from '@ai-cost-profiler/shared';
import type { CostBreakdownRow } from './types/analytics-query-result-types.js';

// Whitelist of allowed groupBy columns to prevent SQL injection
const GROUP_BY_COLUMNS: Record<string, string> = {
  feature: 'feature',
  model: 'model',
  provider: 'provider',
  user: 'user_id',
};

/**
 * Get cost breakdown grouped by dimension
 */
export async function getCostBreakdown(
  query: CostBreakdownQuery
): Promise<CostBreakdownItem[]> {
  const { from, to, groupBy } = query;

  const groupColumn = GROUP_BY_COLUMNS[groupBy];
  if (!groupColumn) {
    throw new Error(`Invalid groupBy value: ${groupBy}`);
  }

  const result = await db.execute(sql`
    SELECT
      ${sql.raw(groupColumn)} as dimension,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as total_cost_usd,
      SUM(input_tokens + output_tokens) as total_tokens,
      COUNT(*) as request_count,
      AVG(latency_ms) as avg_latency_ms
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
      AND ${sql.raw(groupColumn)} IS NOT NULL
    GROUP BY ${sql.raw(groupColumn)}
    ORDER BY total_cost_usd DESC
    LIMIT 500
  `);

  return (result.rows as CostBreakdownRow[]).map((row) => ({
    dimension: row.dimension,
    totalCostUsd: Number(row.total_cost_usd),
    totalTokens: Number(row.total_tokens),
    requestCount: Number(row.request_count),
    avgLatencyMs: Number(row.avg_latency_ms),
  }));
}
