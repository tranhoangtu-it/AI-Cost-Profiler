import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';
import type { FlamegraphRow } from './types/analytics-query-result-types.js';

/**
 * Get hierarchical flamegraph data: Project > Feature > Model
 * Single-pass aggregation using flat Map lookup
 */
export async function getFlamegraphData(
  from: string,
  to: string
): Promise<FlamegraphNode> {
  const result = await db.execute(sql`
    SELECT
      project_id,
      feature,
      model,
      SUM(CAST(verified_cost_usd AS NUMERIC)) as cost
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY project_id, feature, model
    ORDER BY project_id, feature, model
    LIMIT 1000
  `);

  const rows = result.rows as FlamegraphRow[];
  const root: FlamegraphNode = { name: 'root', value: 0, children: [] };
  const projectNodes = new Map<string, FlamegraphNode>();
  const featureNodes = new Map<string, FlamegraphNode>();

  for (const row of rows) {
    const cost = Number(row.cost);

    // Get or create project node
    let projectNode = projectNodes.get(row.project_id);
    if (!projectNode) {
      projectNode = { name: row.project_id, value: 0, children: [] };
      projectNodes.set(row.project_id, projectNode);
      root.children!.push(projectNode);
    }

    // Get or create feature node (scoped to project)
    const featureKey = `${row.project_id}::${row.feature}`;
    let featureNode = featureNodes.get(featureKey);
    if (!featureNode) {
      featureNode = { name: row.feature, value: 0, children: [] };
      featureNodes.set(featureKey, featureNode);
      projectNode.children!.push(featureNode);
    }

    // Add model leaf
    featureNode.children!.push({ name: row.model, value: cost });
    featureNode.value += cost;
    projectNode.value += cost;
    root.value += cost;
  }

  return root;
}
