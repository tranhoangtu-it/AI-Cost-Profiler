const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

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

export const api = {
  getCostBreakdown: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/cost-breakdown?${new URLSearchParams(params)}`),
  getFlamegraph: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/flamegraph?${new URLSearchParams(params)}`),
  getTimeseries: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/timeseries?${new URLSearchParams(params)}`),
  getPrompts: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/prompts?${new URLSearchParams(params)}`),
  getRealtimeTotals: () =>
    apiFetch('/api/v1/analytics/realtime-totals'),
};
