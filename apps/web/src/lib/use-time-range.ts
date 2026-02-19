import { useMemo } from 'react';

/**
 * Returns stable from/to ISO strings for the last 24h.
 * Rounded to nearest minute to prevent unstable React Query keys.
 */
export function useTimeRange() {
  return useMemo(() => {
    const now = new Date();
    // Round to nearest minute to stabilize query keys
    now.setSeconds(0, 0);
    const to = now.toISOString();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    return { from, to };
  }, []);
}
