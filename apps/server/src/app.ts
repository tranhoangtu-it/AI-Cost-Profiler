import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { eventRouter } from './routes/event-routes.js';
import { analyticsRouter } from './routes/analytics-routes.js';
import { streamRouter } from './routes/stream-routes.js';
import { exportRouter } from './routes/export-routes.js';
import { errorHandler, notFoundHandler, requestIdMiddleware } from './middleware/error-handler.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { isRedisHealthy } from './lib/redis.js';
import { pool } from './db/index.js';

/**
 * Create and configure Express application
 */
export function createApp(): express.Application {
  const app = express();

  // Request ID tracking (must be first for log correlation)
  app.use(requestIdMiddleware);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow SSE
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000'),
    credentials: true,
  }));

  // Body parser
  app.use(express.json({ limit: '10mb' }));

  // Response compression (skip SSE to avoid buffering)
  app.use(compression({
    filter: (req, res) => {
      if (req.headers.accept === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  }));

  // Comprehensive health check with dependency status
  app.get('/health', async (_req, res) => {
    const [redisOk, dbOk] = await Promise.all([
      isRedisHealthy(),
      pool.query('SELECT 1').then(() => true).catch(() => false),
    ]);

    const healthy = redisOk && dbOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisOk ? 'ok' : 'down',
        database: dbOk ? 'ok' : 'down',
      },
    });
  });

  // API key authentication for all /api routes
  // Disabled when API_KEYS env var is not set (development mode)
  app.use('/api', apiKeyAuth);

  // API routes (v1)
  app.use('/api/v1/events', eventRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/stream', streamRouter);
  app.use('/api/v1/export', exportRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
