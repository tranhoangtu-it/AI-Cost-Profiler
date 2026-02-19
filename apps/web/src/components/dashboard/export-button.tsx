'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useExport } from '@/hooks/use-export';

interface ExportButtonProps {
  endpoint: string;
  filename: string;
}

export function ExportButton({ endpoint, filename }: ExportButtonProps) {
  const { exportData } = useExport();
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss error toast after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function handleExport(format: 'csv' | 'json') {
    setLoading(true);
    setIsOpen(false);
    try {
      await exportData(endpoint, format, filename);
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="px-3 py-1.5 text-sm rounded border border-border-default bg-bg-surface hover:bg-bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        {loading ? 'Exporting...' : 'Export'}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-40 rounded border border-border-default bg-bg-surface shadow-lg z-20">
            <button
              onClick={() => handleExport('csv')}
              className="w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors"
            >
              Export as CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors border-t border-border-default"
            >
              Export as JSON
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="absolute right-0 mt-1 px-3 py-2 rounded bg-cost-high/10 text-cost-high text-xs border border-cost-high/20 z-30">
          {error}
          <button onClick={() => setError(null)} className="ml-2">&times;</button>
        </div>
      )}
    </div>
  );
}
