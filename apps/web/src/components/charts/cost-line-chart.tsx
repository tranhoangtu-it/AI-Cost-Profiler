'use client';

import { memo, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeseriesPoint } from '@ai-cost-profiler/shared';

interface CostLineChartProps {
  data: TimeseriesPoint[];
}

export const CostLineChart = memo(function CostLineChart({ data }: CostLineChartProps) {
  const formatted = useMemo(() => data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit',
    }),
  })), [data]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis dataKey="time" stroke="#5c5c72" fontSize={12} />
        <YAxis stroke="#5c5c72" fontSize={12} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111118',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#e8e8ed',
          }}
          formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="#818cf8"
          strokeWidth={2}
          dot={false}
          name="Cost (USD)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
});
