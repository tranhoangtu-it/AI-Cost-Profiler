'use client';

import { useMemo } from 'react';
import { Group } from '@visx/group';
import { Treemap, hierarchy, treemapSquarify } from '@visx/hierarchy';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { formatCost } from '@/lib/utils';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

const COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#c084fc'];

interface CostTreemapProps {
  data: FlamegraphNode;
}

function TreemapInner({ data, width, height }: CostTreemapProps & { width: number; height: number }) {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip<FlamegraphNode>();

  const root = useMemo(
    () => hierarchy(data).sum((d) => d.value).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [data],
  );

  if (width < 10 || height < 10) return null;

  return (
    <>
      <svg width={width} height={height}>
        <Treemap
          root={root}
          size={[width, height]}
          tile={treemapSquarify}
          round
          paddingInner={2}
        >
          {(treemap) => (
            <Group>
              {treemap.descendants().filter(n => n.depth === 1).map((node, i) => (
                <g
                  key={node.data.name}
                  onMouseMove={(e) => showTooltip({
                    tooltipData: node.data,
                    tooltipLeft: e.clientX,
                    tooltipTop: e.clientY,
                  })}
                  onMouseLeave={hideTooltip}
                >
                  <rect
                    x={node.x0}
                    y={node.y0}
                    width={node.x1 - node.x0}
                    height={node.y1 - node.y0}
                    fill={COLORS[i % COLORS.length]}
                    opacity={0.85}
                    rx={4}
                    className="cursor-pointer hover:opacity-100 transition-opacity"
                  />
                  {(node.x1 - node.x0) > 60 && (node.y1 - node.y0) > 30 && (
                    <>
                      <text
                        x={node.x0 + 8}
                        y={node.y0 + 18}
                        fill="#e8e8ed"
                        fontSize={12}
                        fontWeight={500}
                      >
                        {node.data.name}
                      </text>
                      <text
                        x={node.x0 + 8}
                        y={node.y0 + 34}
                        fill="#9494a8"
                        fontSize={11}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {formatCost(node.value ?? 0)}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </Group>
          )}
        </Treemap>
      </svg>
      {tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{
          backgroundColor: '#111118',
          border: '1px solid #1e1e2e',
          borderRadius: 8,
          color: '#e8e8ed',
          padding: '8px 12px',
          fontSize: 12,
        }}>
          <strong>{tooltipData.name}</strong>
          <br />
          Cost: {formatCost(tooltipData.value)}
        </TooltipWithBounds>
      )}
    </>
  );
}

export function CostTreemap({ data }: CostTreemapProps) {
  return (
    <div style={{ height: 400 }}>
      <ParentSize>
        {({ width, height }) => <TreemapInner data={data} width={width} height={height} />}
      </ParentSize>
    </div>
  );
}
