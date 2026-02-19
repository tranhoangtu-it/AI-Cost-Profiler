import { Router, type Router as RouterType } from 'express';
import { stringify } from 'csv-stringify';
import { exportQuerySchema, costSummaryQuerySchema, type ExportQuery, type CostSummaryQuery } from '@ai-cost-profiler/shared';
import { db, events } from '../db/index.js';
import { sql, desc, gte, lte, eq, and, sum, count, avg, min, max } from 'drizzle-orm';
import { rateLimiters } from '../middleware/rate-limiter.js';
import { validateQuery } from '../middleware/request-validator.js';

const MAX_EXPORT_ROWS = 10_000;

export const exportRouter: RouterType = Router();

/**
 * GET /events - Export events as CSV or JSON
 */
exportRouter.get('/events', rateLimiters.export, validateQuery(exportQuerySchema), async (req, res, next) => {
  try {
    const { format, startDate, endDate, feature, model, provider } = req.query as ExportQuery;

    const conditions = [];
    if (startDate) conditions.push(gte(events.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(events.createdAt, new Date(endDate)));
    if (feature) conditions.push(eq(events.feature, feature));
    if (model) conditions.push(eq(events.model, model));
    if (provider) conditions.push(eq(events.provider, provider));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select()
      .from(events)
      .orderBy(desc(events.createdAt))
      .limit(MAX_EXPORT_ROWS);

    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }

    const results = await query.execute();
    const truncated = results.length >= MAX_EXPORT_ROWS;

    res.setHeader('X-Export-Row-Limit', String(MAX_EXPORT_ROWS));
    if (truncated) res.setHeader('X-Export-Truncated', 'true');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=events.csv');

      const stringifier = stringify({
        header: true,
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'timestamp', header: 'Timestamp' },
          { key: 'feature', header: 'Feature' },
          { key: 'provider', header: 'Provider' },
          { key: 'model', header: 'Model' },
          { key: 'inputTokens', header: 'Input Tokens' },
          { key: 'outputTokens', header: 'Output Tokens' },
          { key: 'cachedTokens', header: 'Cached Tokens' },
          { key: 'totalTokens', header: 'Total Tokens' },
          { key: 'cost', header: 'Cost (USD)' },
          { key: 'latency', header: 'Latency (ms)' },
          { key: 'isStreaming', header: 'Streaming' },
          { key: 'isError', header: 'Error' },
          { key: 'errorCode', header: 'Error Code' },
          { key: 'retryCount', header: 'Retry Count' },
        ],
      });

      stringifier.pipe(res);

      for (const row of results) {
        stringifier.write({
          id: row.id,
          timestamp: row.createdAt.toISOString(),
          feature: row.feature || '',
          provider: row.provider,
          model: row.model,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          cachedTokens: row.cachedTokens,
          totalTokens: row.inputTokens + row.outputTokens,
          cost: row.verifiedCostUsd || row.estimatedCostUsd || '0',
          latency: row.latencyMs,
          isStreaming: row.isStreaming ? 'true' : 'false',
          isError: row.isError ? 'true' : 'false',
          errorCode: row.errorCode || '',
          retryCount: row.retryCount,
        });
      }

      stringifier.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=events.json');
      res.json(results);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /cost-summary - Export aggregated cost summary
 */
exportRouter.get('/cost-summary', rateLimiters.export, validateQuery(costSummaryQuerySchema), async (req, res, next) => {
  try {
    const { format, startDate, endDate, groupBy } = req.query as CostSummaryQuery;

    // Map groupBy to column - whitelist-guarded
    const groupColumnMap = {
      feature: events.feature,
      model: events.model,
      provider: events.provider,
    } as const;

    const groupColumn = groupColumnMap[groupBy];

    // Build parameterized conditions
    const conditions = [];
    if (startDate) conditions.push(gte(events.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(events.createdAt, new Date(endDate)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Use Drizzle query builder - fully parameterized, no raw SQL interpolation
    let query = db
      .select({
        dimension: groupColumn,
        requestCount: count(),
        totalInputTokens: sum(events.inputTokens),
        totalOutputTokens: sum(events.outputTokens),
        totalTokens: sql<string>`SUM(${events.inputTokens} + ${events.outputTokens})`,
        totalCostUsd: sum(events.verifiedCostUsd),
        avgLatencyMs: avg(events.latencyMs),
        minLatencyMs: min(events.latencyMs),
        maxLatencyMs: max(events.latencyMs),
      })
      .from(events)
      .groupBy(groupColumn)
      .orderBy(sql`SUM(CAST(${events.verifiedCostUsd} AS NUMERIC)) DESC`);

    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }

    const result = await query.execute();

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=cost-summary.csv');

      const stringifier = stringify({
        header: true,
        columns: [
          { key: 'dimension', header: 'Dimension' },
          { key: 'requestCount', header: 'Requests' },
          { key: 'totalInputTokens', header: 'Input Tokens' },
          { key: 'totalOutputTokens', header: 'Output Tokens' },
          { key: 'totalTokens', header: 'Total Tokens' },
          { key: 'totalCost', header: 'Total Cost (USD)' },
          { key: 'avgLatency', header: 'Avg Latency (ms)' },
          { key: 'minLatency', header: 'Min Latency (ms)' },
          { key: 'maxLatency', header: 'Max Latency (ms)' },
        ],
      });

      stringifier.pipe(res);

      for (const row of result) {
        stringifier.write({
          dimension: row.dimension || 'N/A',
          requestCount: row.requestCount,
          totalInputTokens: row.totalInputTokens,
          totalOutputTokens: row.totalOutputTokens,
          totalTokens: row.totalTokens,
          totalCost: parseFloat(row.totalCostUsd || '0').toFixed(6),
          avgLatency: parseFloat(row.avgLatencyMs || '0').toFixed(2),
          minLatency: row.minLatencyMs,
          maxLatency: row.maxLatencyMs,
        });
      }

      stringifier.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=cost-summary.json');
      res.json(result);
    }
  } catch (error) {
    next(error);
  }
});
