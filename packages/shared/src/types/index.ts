/**
 * Type definitions for AI Cost Profiler shared package
 */

import type {
  LlmEvent,
  Provider,
  BatchEventRequest,
} from '../schemas/event-schema.js';
import type {
  TimeRange,
  Granularity,
  GroupBy,
  CostBreakdownQuery,
  CostBreakdownItem,
  FlamegraphNode,
  TimeseriesPoint,
  PromptAnalysis,
} from '../schemas/analytics-schema.js';

// Re-export schema-inferred types
export type {
  LlmEvent,
  Provider,
  BatchEventRequest,
  TimeRange,
  Granularity,
  GroupBy,
  CostBreakdownQuery,
  CostBreakdownItem,
  FlamegraphNode,
  TimeseriesPoint,
  PromptAnalysis,
};

/**
 * Model pricing structure (per 1M tokens)
 */
export interface ModelPricing {
  model: string;
  provider: Provider;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

/**
 * SDK configuration options
 */
export interface SdkConfig {
  serverUrl: string;
  feature: string;
  userId?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Analytics API response types
 */
export interface CostBreakdownResponse {
  items: CostBreakdownItem[];
  totalCostUsd: number;
  totalTokens: number;
  totalRequests: number;
}

export interface TimeseriesResponse {
  dataPoints: TimeseriesPoint[];
  granularity: Granularity;
}

export interface FlamegraphResponse {
  root: FlamegraphNode;
  totalCostUsd: number;
}

export interface PromptAnalysisResponse {
  analyses: PromptAnalysis[];
  totalUniquePrompts: number;
  totalDuplicateCost: number;
}
