import type {
  CostBreakdownItem,
  FlamegraphNode,
  TimeseriesPoint,
  PromptAnalysis,
} from '@ai-cost-profiler/shared';

/**
 * API base URL — single source of truth for the frontend
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

/**
 * Typed API fetch wrapper with error handling
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Realtime totals from Redis
 */
export interface RealtimeTotals {
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
}

/**
 * Typed API client
 */
export const api = {
  getCostBreakdown: (params: Record<string, string>): Promise<CostBreakdownItem[]> =>
    apiFetch(`/api/v1/analytics/cost-breakdown?${new URLSearchParams(params)}`),

  getFlamegraph: (params: Record<string, string>): Promise<FlamegraphNode> =>
    apiFetch(`/api/v1/analytics/flamegraph?${new URLSearchParams(params)}`),

  getTimeseries: (params: Record<string, string>): Promise<TimeseriesPoint[]> =>
    apiFetch(`/api/v1/analytics/timeseries?${new URLSearchParams(params)}`),

  getPrompts: (params: Record<string, string>): Promise<PromptAnalysis[]> =>
    apiFetch(`/api/v1/analytics/prompts?${new URLSearchParams(params)}`),

  getRealtimeTotals: (): Promise<RealtimeTotals> =>
    apiFetch('/api/v1/analytics/realtime-totals'),
};
