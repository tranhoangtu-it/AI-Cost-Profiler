import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { TimeseriesPoint } from '@ai-cost-profiler/shared';
import type { TimeseriesRow } from './types/analytics-query-result-types.js';

// Whitelist of allowed granularity values to prevent SQL injection
const GRANULARITY_VALUES: Record<string, string> = {
  hour: 'hour',
  day: 'day',
  week: 'week',
};

/**
 * Get time series data with specified granularity
 */
export async function getTimeseries(
  from: string,
  to: string,
  granularity: 'hour' | 'day' | 'week'
): Promise<TimeseriesPoint[]> {
  const safeGranularity = GRANULARITY_VALUES[granularity];
  if (!safeGranularity) {
    throw new Error(`Invalid granularity: ${granularity}`);
  }

  // safeGranularity is whitelist-guarded, sql.raw is safe here
  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC(${sql.raw(`'${safeGranularity}'`)}, created_at) as timestamp,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as value
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY DATE_TRUNC(${sql.raw(`'${safeGranularity}'`)}, created_at)
    ORDER BY timestamp ASC
    LIMIT 1000
  `);

  return (result.rows as unknown as TimeseriesRow[]).map((row) => ({
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp as string).toISOString(),
    value: Number(row.value),
  }));
}
