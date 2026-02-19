import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

/**
 * Get hierarchical flamegraph data: Project > Feature > Model
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
  `);

  // Build hierarchy
  const projectMap = new Map<string, Map<string, Map<string, number>>>();

  for (const row of result.rows as any[]) {
    const { project_id, feature, model, cost } = row;

    if (!projectMap.has(project_id)) {
      projectMap.set(project_id, new Map());
    }
    const featureMap = projectMap.get(project_id)!;

    if (!featureMap.has(feature)) {
      featureMap.set(feature, new Map());
    }
    const modelMap = featureMap.get(feature)!;

    modelMap.set(model, parseFloat(cost));
  }

  // Convert to flamegraph structure
  const root: FlamegraphNode = {
    name: 'root',
    value: 0,
    children: [],
  };

  for (const [projectId, featureMap] of projectMap) {
    const projectNode: FlamegraphNode = {
      name: projectId,
      value: 0,
      children: [],
    };

    for (const [feature, modelMap] of featureMap) {
      const featureNode: FlamegraphNode = {
        name: feature,
        value: 0,
        children: [],
      };

      for (const [model, cost] of modelMap) {
        featureNode.children!.push({ name: model, value: cost });
        featureNode.value += cost;
      }

      projectNode.children!.push(featureNode);
      projectNode.value += featureNode.value;
    }

    root.children!.push(projectNode);
    root.value += projectNode.value;
  }

  return root;
}
