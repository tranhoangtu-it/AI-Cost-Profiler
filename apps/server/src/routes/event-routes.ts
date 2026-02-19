import { Router, type Router as RouterType } from 'express';
import { batchEventRequestSchema } from '@ai-cost-profiler/shared';
import { validateBody } from '../middleware/request-validator.js';
import { processEventBatch } from '../services/event-processor.js';
import { logger } from '../middleware/error-handler.js';

export const eventRouter: RouterType = Router();

/**
 * POST /events - Ingest batch of LLM events
 */
eventRouter.post(
  '/',
  validateBody(batchEventRequestSchema),
  async (req, res, next) => {
    try {
      const { events } = req.body;

      await processEventBatch(events);

      logger.info({ count: events.length }, 'Events ingested');

      res.status(202).json({
        success: true,
        count: events.length,
      });
    } catch (error) {
      next(error);
    }
  }
);
