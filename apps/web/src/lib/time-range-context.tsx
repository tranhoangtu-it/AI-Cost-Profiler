'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

type TimeRangeValue = '1h' | '6h' | '24h' | '7d' | '30d';

interface TimeRange {
  from: string;
  to: string;
}

interface TimeRangeContextValue extends TimeRange {
  range: TimeRangeValue;
  setRange: (range: TimeRangeValue) => void;
}

const TimeRangeContext = createContext<TimeRangeContextValue | undefined>(undefined);

function calculateTimeRange(range: TimeRangeValue): TimeRange {
  const now = new Date();
  now.setSeconds(0, 0);
  const to = now.toISOString();

  const hours: Record<TimeRangeValue, number> = {
    '1h': 1,
    '6h': 6,
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30,
  };

  const from = new Date(now.getTime() - hours[range] * 60 * 60 * 1000).toISOString();
  return { from, to };
}

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<TimeRangeValue>('24h');

  const timeRange = useMemo(() => calculateTimeRange(range), [range]);

  const setRange = useCallback((newRange: TimeRangeValue) => {
    setRangeState(newRange);
  }, []);

  const value = useMemo(
    () => ({
      ...timeRange,
      range,
      setRange,
    }),
    [timeRange, range, setRange]
  );

  return <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>;
}

export function useTimeRange() {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error('useTimeRange must be used within TimeRangeProvider');
  }
  return context;
}
