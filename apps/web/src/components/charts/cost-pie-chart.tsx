'use client';

import { memo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { CostBreakdownItem } from '@ai-cost-profiler/shared';

const COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#c084fc', '#fb923c'];

interface CostPieChartProps {
  data: CostBreakdownItem[];
}

export const CostPieChart = memo(function CostPieChart({ data }: CostPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="totalCostUsd"
          nameKey="dimension"
          cx="50%"
          cy="50%"
          outerRadius={100}
          strokeWidth={1}
          stroke="#0a0a0f"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#111118',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#e8e8ed',
          }}
          formatter={(value: number) => `$${value.toFixed(4)}`}
        />
        <Legend formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
});
