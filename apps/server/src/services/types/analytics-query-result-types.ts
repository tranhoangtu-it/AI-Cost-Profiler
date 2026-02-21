/** Raw DB row from cost breakdown GROUP BY query */
export interface CostBreakdownRow {
  dimension: string;
  total_cost_usd: string;
  total_tokens: string;
  request_count: string;
  avg_latency_ms: string;
}

/** Raw DB row from flamegraph GROUP BY query */
export interface FlamegraphRow {
  project_id: string;
  feature: string;
  model: string;
  cost: string;
}

/** Raw DB row from timeseries DATE_TRUNC query */
export interface TimeseriesRow {
  timestamp: Date | string;
  value: string;
}

/** Raw DB row from prompt analysis query */
export interface PromptAnalysisRow {
  content: string;
  prompt_hash: string;
  occurrences: string;
  total_cost_usd: string;
  avg_tokens: string;
}
