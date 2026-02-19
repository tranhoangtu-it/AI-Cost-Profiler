import { Router, type Router as RouterType } from 'express';
import { costBreakdownQuerySchema, timeRangeSchema } from '@ai-cost-profiler/shared';
import { validateQuery } from '../middleware/request-validator.js';
import {
  getCostBreakdown,
  getFlamegraphData,
  getTimeseries,
  getPromptAnalysis,
  getRealtimeTotals,
} from '../services/analytics-service.js';

export const analyticsRouter: RouterType = Router();

/**
 * GET /cost-breakdown - Cost breakdown by dimension
 */
analyticsRouter.get(
  '/cost-breakdown',
  validateQuery(costBreakdownQuerySchema),
  async (req, res, next) => {
    try {
      const query = req.query as any;
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
  validateQuery(timeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as any;
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
  validateQuery(timeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to, granularity } = req.query as any;
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
  validateQuery(timeRangeSchema),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as any;
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
analyticsRouter.get('/realtime-totals', async (req, res, next) => {
  try {
    const result = await getRealtimeTotals();
    res.json(result);
  } catch (error) {
    next(error);
  }
});
