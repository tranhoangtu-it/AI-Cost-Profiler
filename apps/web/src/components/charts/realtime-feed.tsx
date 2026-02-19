'use client';

import { useEffect, useState, useRef } from 'react';
import { formatCost } from '@/lib/utils';

interface RealtimeEvent {
  count: number;
  totalCost: number;
  timestamp: string;
  features: string[];
  type?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export function RealtimeFeed() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/v1/stream/costs`);

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (event) => {
      const data: RealtimeEvent = JSON.parse(event.data);
      if (data.type === 'snapshot') {
        setTotalCost(data.totalCost);
      } else {
        setTotalCost((prev) => prev + data.totalCost);
        setEvents((prev) => [data, ...prev].slice(0, 100));
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-cost-low' : 'bg-cost-high'}`} />
        <span className="text-xs text-text-muted">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="mb-6 p-4 rounded-lg border border-border-default bg-bg-surface">
        <p className="text-xs uppercase tracking-wider text-text-muted mb-1">Running Total</p>
        <p className="text-3xl font-semibold font-mono text-text-primary">{formatCost(totalCost)}</p>
      </div>

      <div ref={containerRef} className="space-y-2 max-h-[500px] overflow-auto">
        {events.length === 0 && (
          <p className="text-text-muted text-sm">Waiting for events...</p>
        )}
        {events.map((event, i) => (
          <div
            key={`${event.timestamp}-${i}`}
            className="flex items-center justify-between p-3 rounded border border-border-default bg-bg-surface text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="text-text-muted font-mono text-xs">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-text-secondary">
                {event.count} call{event.count !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-1">
                {event.features.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded bg-bg-muted text-xs text-text-secondary">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <span className="font-mono text-cost-medium">{formatCost(event.totalCost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
