import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { TimeseriesPoint } from '@ai-cost-profiler/shared';

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

  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC(${sql.raw(`'${safeGranularity}'`)}, created_at) as timestamp,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as value
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY DATE_TRUNC(${sql.raw(`'${safeGranularity}'`)}, created_at)
    ORDER BY timestamp ASC
  `);

  return result.rows.map((row: any) => ({
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
    value: parseFloat(row.value),
  }));
}
