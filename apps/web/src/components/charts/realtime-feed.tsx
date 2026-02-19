'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { formatCost } from '@/lib/utils';

interface RealtimeEvent {
  count: number;
  totalCost: number;
  timestamp: string;
  features: string[];
  type?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';
const MAX_RETRIES = 10;

export function RealtimeFeed() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource(`${API_BASE}/api/v1/stream/costs`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };

    es.onmessage = (event) => {
      const data: RealtimeEvent = JSON.parse(event.data);
      if (data.type === 'snapshot') {
        setTotalCost(data.totalCost);
      } else {
        setTotalCost((prev) => prev + data.totalCost);
        setEvents((prev) => [data, ...prev].slice(0, 100));
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();

      if (retryRef.current < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30_000);
        retryRef.current++;
        timeoutRef.current = setTimeout(connect, delay);
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [connect]);

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
              {event.features && event.features.length > 0 && (
                <div className="flex gap-1">
                  {event.features.map((f) => (
                    <span key={f} className="px-2 py-0.5 rounded bg-bg-muted text-xs text-text-secondary">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="font-mono text-cost-medium">{formatCost(event.totalCost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
