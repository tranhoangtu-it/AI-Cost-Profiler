import { Router, type Router as RouterType } from 'express';
import { stringify } from 'csv-stringify';
import { db, events } from '../db/index.js';
import { sql, desc, gte, lte, eq, and } from 'drizzle-orm';
import { rateLimiters } from '../middleware/rate-limiter.js';

export const exportRouter: RouterType = Router();

/**
 * GET /events - Export events as CSV or JSON
 */
exportRouter.get('/events', rateLimiters.export, async (req, res, next) => {
  try {
    const { format = 'csv', startDate, endDate, feature, model, provider } = req.query;

    // Build query with filters
    const conditions = [];
    if (startDate) conditions.push(gte(events.createdAt, new Date(startDate as string)));
    if (endDate) conditions.push(lte(events.createdAt, new Date(endDate as string)));
    if (feature) conditions.push(eq(events.feature, feature as string));
    if (model) conditions.push(eq(events.model, model as string));
    if (provider) conditions.push(eq(events.provider, provider as string));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

      // Stream results to avoid loading all data into memory
      let query = db
        .select()
        .from(events)
        .orderBy(desc(events.createdAt));

      if (whereClause) {
        query = query.where(whereClause) as any;
      }

      const results = await query.execute();

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
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=events.json');

      let query = db
        .select()
        .from(events)
        .orderBy(desc(events.createdAt));

      if (whereClause) {
        query = query.where(whereClause) as any;
      }

      const results = await query.execute();
      res.json(results);
    } else {
      res.status(400).json({ error: 'Invalid format. Use csv or json' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /cost-summary - Export aggregated cost summary
 */
exportRouter.get('/cost-summary', rateLimiters.export, async (req, res, next) => {
  try {
    const { format = 'csv', startDate, endDate, groupBy = 'feature' } = req.query;

    // Validate groupBy
    const allowedGroupBy: Record<string, string> = {
      feature: 'feature',
      model: 'model',
      provider: 'provider',
    };

    const groupColumn = allowedGroupBy[groupBy as string];
    if (!groupColumn) {
      return res.status(400).json({ error: 'Invalid groupBy. Use feature, model, or provider' });
    }

    // Build SQL query
    const conditions = [];
    if (startDate) conditions.push(`created_at >= '${startDate}'`);
    if (endDate) conditions.push(`created_at <= '${endDate}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.execute(sql`
      SELECT
        ${sql.raw(groupColumn)} as dimension,
        COUNT(*) as request_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(CAST(verified_cost_usd AS NUMERIC)) as total_cost_usd,
        AVG(latency_ms) as avg_latency_ms,
        MIN(latency_ms) as min_latency_ms,
        MAX(latency_ms) as max_latency_ms
      FROM events
      ${sql.raw(whereClause)}
      GROUP BY ${sql.raw(groupColumn)}
      ORDER BY total_cost_usd DESC
    `);

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

      for (const row of result.rows) {
        const r = row as any;
        stringifier.write({
          dimension: r.dimension || 'N/A',
          requestCount: r.request_count,
          totalInputTokens: r.total_input_tokens,
          totalOutputTokens: r.total_output_tokens,
          totalTokens: r.total_tokens,
          totalCost: parseFloat(r.total_cost_usd || '0').toFixed(6),
          avgLatency: parseFloat(r.avg_latency_ms || '0').toFixed(2),
          minLatency: r.min_latency_ms,
          maxLatency: r.max_latency_ms,
        });
      }

      stringifier.end();
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=cost-summary.json');
      res.json(result.rows);
    } else {
      res.status(400).json({ error: 'Invalid format. Use csv or json' });
    }
  } catch (error) {
    next(error);
  }
});
