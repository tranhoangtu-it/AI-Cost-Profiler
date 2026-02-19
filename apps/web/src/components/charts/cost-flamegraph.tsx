'use client';

import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { flamegraph } from 'd3-flame-graph';
import 'd3-flame-graph/dist/d3-flamegraph.css';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

interface CostFlamegraphProps {
  data: FlamegraphNode;
}

export function CostFlamegraph({ data }: CostFlamegraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const chart = flamegraph()
      .width(width)
      .cellHeight(24)
      .transitionDuration(500)
      .minFrameSize(5)
      .tooltip(true)
      .title('')
      .setColorMapper((_d: unknown, originalColor: string) => originalColor);

    select(containerRef.current)
      .datum(data)
      .call(chart as any);

    return () => {
      if (containerRef.current) {
        select(containerRef.current).selectAll('*').remove();
      }
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[400px] [&_.d3-flame-graph]:bg-transparent [&_rect]:rx-1"
    />
  );
}
