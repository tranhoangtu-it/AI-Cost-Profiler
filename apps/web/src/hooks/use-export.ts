import { useCallback } from 'react';
import { useTimeRange } from '@/lib/time-range-context';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export function useExport() {
  const { from, to } = useTimeRange();

  const exportData = useCallback(
    async (endpoint: string, format: 'csv' | 'json', filename: string) => {
      const params = new URLSearchParams({
        format,
        from,
        to,
      });

      const res = await fetch(`${API_BASE}/api/v1/export${endpoint}?${params}`);
      if (!res.ok) {
        throw new Error(`Export failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    [from, to]
  );

  return { exportData };
}
