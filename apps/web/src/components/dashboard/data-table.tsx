'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right';
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      })
    : data;

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bg-muted">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  'px-4 py-2 text-xs uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-secondary',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (sortAsc ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-border-default hover:bg-bg-elevated transition-colors',
                i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-base',
              )}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={cn(
                    'px-4 py-2.5',
                    col.align === 'right' ? 'text-right font-mono' : '',
                  )}
                >
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
