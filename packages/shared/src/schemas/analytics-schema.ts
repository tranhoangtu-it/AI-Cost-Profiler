import { z } from 'zod';

/**
 * Time range granularity options
 */
export const granularitySchema = z.enum(['hour', 'day', 'week']);

/**
 * Base time range schema for analytics queries
 */
export const timeRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: granularitySchema,
});

/**
 * Group by dimensions for cost breakdown
 */
export const groupBySchema = z.enum(['feature', 'model', 'provider', 'user']);

/**
 * Cost breakdown query schema
 */
export const costBreakdownQuerySchema = timeRangeSchema.extend({
  groupBy: groupBySchema,
});

/**
 * Individual cost breakdown item
 */
export const costBreakdownItemSchema = z.object({
  dimension: z.string(),
  totalCostUsd: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  requestCount: z.number().int().nonnegative(),
  avgLatencyMs: z.number().nonnegative(),
});

/**
 * Recursive flamegraph node schema
 */
export const flamegraphNodeSchema: z.ZodType<{
  name: string;
  value: number;
  children?: Array<{
    name: string;
    value: number;
    children?: unknown[];
  }>;
}> = z.lazy(() =>
  z.object({
    name: z.string(),
    value: z.number().nonnegative(),
    children: z.array(flamegraphNodeSchema).optional(),
  })
);

/**
 * Time series data point
 */
export const timeseriesPointSchema = z.object({
  timestamp: z.string().datetime(),
  value: z.number().nonnegative(),
});

/**
 * Prompt similarity analysis result
 */
export const promptAnalysisSchema = z.object({
  promptHash: z.string(),
  content: z.string(),
  occurrences: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  avgTokens: z.number().nonnegative(),
  similarPrompts: z.array(
    z.object({
      promptHash: z.string(),
      similarity: z.number().min(0).max(1),
      content: z.string(),
    })
  ),
});

export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Granularity = z.infer<typeof granularitySchema>;
export type GroupBy = z.infer<typeof groupBySchema>;
export type CostBreakdownQuery = z.infer<typeof costBreakdownQuerySchema>;
export type CostBreakdownItem = z.infer<typeof costBreakdownItemSchema>;
export type FlamegraphNode = z.infer<typeof flamegraphNodeSchema>;
export type TimeseriesPoint = z.infer<typeof timeseriesPointSchema>;
export type PromptAnalysis = z.infer<typeof promptAnalysisSchema>;
