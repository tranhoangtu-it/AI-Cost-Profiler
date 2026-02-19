import { db, events } from '../db/index.js';
import { redis, REDIS_KEYS } from '../lib/redis.js';
import { sql } from 'drizzle-orm';
import type {
  CostBreakdownQuery,
  CostBreakdownItem,
  FlamegraphNode,
  TimeseriesPoint,
  PromptAnalysis,
  TimeRange,
} from '@ai-cost-profiler/shared';

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

  // Safe column lookup via whitelist
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
  `);

  return result.rows.map((row: any) => ({
    dimension: row.dimension,
    totalCostUsd: parseFloat(row.total_cost_usd),
    totalTokens: parseInt(row.total_tokens),
    requestCount: parseInt(row.request_count),
    avgLatencyMs: parseFloat(row.avg_latency_ms),
  }));
}

/**
 * Get hierarchical flamegraph data: Project > Feature > Model
 */
export async function getFlamegraphData(
  from: string,
  to: string
): Promise<FlamegraphNode> {
  const result = await db.execute(sql`
    SELECT
      project_id,
      feature,
      model,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as cost
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY project_id, feature, model
    ORDER BY project_id, feature, model
  `);

  // Build hierarchy
  const projectMap = new Map<string, Map<string, Map<string, number>>>();

  for (const row of result.rows as any[]) {
    const { project_id, feature, model, cost } = row;

    if (!projectMap.has(project_id)) {
      projectMap.set(project_id, new Map());
    }
    const featureMap = projectMap.get(project_id)!;

    if (!featureMap.has(feature)) {
      featureMap.set(feature, new Map());
    }
    const modelMap = featureMap.get(feature)!;

    modelMap.set(model, parseFloat(cost));
  }

  // Convert to flamegraph structure
  const root: FlamegraphNode = {
    name: 'root',
    value: 0,
    children: [],
  };

  for (const [projectId, featureMap] of projectMap) {
    const projectNode: FlamegraphNode = {
      name: projectId,
      value: 0,
      children: [],
    };

    for (const [feature, modelMap] of featureMap) {
      const featureNode: FlamegraphNode = {
        name: feature,
        value: 0,
        children: [],
      };

      for (const [model, cost] of modelMap) {
        featureNode.children!.push({
          name: model,
          value: cost,
        });
        featureNode.value += cost;
      }

      projectNode.children!.push(featureNode);
      projectNode.value += featureNode.value;
    }

    root.children!.push(projectNode);
    root.value += projectNode.value;
  }

  return root;
}

/**
 * Get time series data with specified granularity
 */
export async function getTimeseries(
  from: string,
  to: string,
  granularity: 'hour' | 'day' | 'week'
): Promise<TimeseriesPoint[]> {
  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC(${granularity}, created_at) as timestamp,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as value
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY DATE_TRUNC(${granularity}, created_at)
    ORDER BY timestamp ASC
  `);

  return result.rows.map((row: any) => ({
    timestamp: row.timestamp.toISOString(),
    value: parseFloat(row.value),
  }));
}

/**
 * Get prompt analysis with bloat detection
 */
export async function getPromptAnalysis(
  from: string,
  to: string
): Promise<PromptAnalysis[]> {
  // Calculate median input tokens for baseline
  const medianResult = await db.execute(sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY input_tokens) as median_tokens
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
  `);

  const medianTokens = parseFloat((medianResult.rows[0] as any).median_tokens);

  // Find prompts with high token usage (>1.5x median)
  const bloatThreshold = medianTokens * 1.5;

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

  return result.rows.map((row: any) => ({
    promptHash: row.prompt_hash,
    content: row.content,
    occurrences: parseInt(row.occurrences),
    totalCostUsd: parseFloat(row.total_cost_usd),
    avgTokens: parseFloat(row.avg_tokens),
    similarPrompts: [], // Placeholder - would use pgvector for full implementation
  }));
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
