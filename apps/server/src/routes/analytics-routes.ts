import { Router, type Router as RouterType } from 'express';
import {
  costBreakdownQuerySchema,
  timeRangeSchema,
  baseTimeRangeSchema,
  type CostBreakdownQuery,
  type TimeRange,
} from '@ai-cost-profiler/shared';
import { validateQuery, validateDateRange } from '../middleware/request-validator.js';
import { rateLimiters } from '../middleware/rate-limiter.js';
import {
  getCostBreakdown,
  getFlamegraphData,
  getTimeseries,
  getPromptAnalysis,
  getRealtimeTotals,
  getEventsList,
} from '../services/analytics-service.js';
import { findSimilarPrompts } from '../services/prompt-similarity-service.js';

export const analyticsRouter: RouterType = Router();

// Date range validation middleware for routes with from/to params
analyticsRouter.use((req, res, next) => {
  const { from, to } = req.query as Record<string, string>;
  if (from && to) {
    const validation = validateDateRange(from, to);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
  }
  next();
});

/**
 * GET /cost-breakdown - Cost breakdown by dimension
 */
analyticsRouter.get(
  '/cost-breakdown',
  rateLimiters.analytics,
  validateQuery(costBreakdownQuerySchema),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as CostBreakdownQuery;
      const result = await getCostBreakdown(query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /flamegraph - Hierarchical cost data
 */
analyticsRouter.get(
  '/flamegraph',
  rateLimiters.analytics,
  validateQuery(baseTimeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as unknown as { from: string; to: string };
      const result = await getFlamegraphData(from, to);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /timeseries - Cost over time
 */
analyticsRouter.get(
  '/timeseries',
  rateLimiters.analytics,
  validateQuery(timeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to, granularity } = req.query as unknown as TimeRange;
      const result = await getTimeseries(from, to, granularity);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /prompts - Prompt bloat analysis
 */
analyticsRouter.get(
  '/prompts',
  rateLimiters.analytics,
  validateQuery(baseTimeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as unknown as { from: string; to: string };
      const result = await getPromptAnalysis(from, to);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /realtime-totals - Real-time aggregates from Redis
 */
analyticsRouter.get('/realtime-totals', rateLimiters.analytics, async (_req, res, next) => {
  try {
    const result = await getRealtimeTotals();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events - Paginated events list with filters
 */
analyticsRouter.get('/events', rateLimiters.analytics, async (req, res, next) => {
  try {
    const { from, to, cursor, limit, feature, model, provider } = req.query as Record<string, string | undefined>;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to parameters are required' });
    }

    const result = await getEventsList(from, to, cursor, limit, {
      feature,
      model,
      provider,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /prompts/:id/similar - Find similar prompts using hash-based grouping
 */
analyticsRouter.get('/prompts/:id/similar', rateLimiters.analytics, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'Prompt ID is required' });
    }
    const threshold = (req.query.threshold as string) ?? '0.8';
    const limit = (req.query.limit as string) ?? '10';

    const result = await findSimilarPrompts(
      id,
      parseFloat(threshold),
      parseInt(limit, 10)
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});
