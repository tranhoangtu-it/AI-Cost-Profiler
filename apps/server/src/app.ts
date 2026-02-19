import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { eventRouter } from './routes/event-routes.js';
import { analyticsRouter } from './routes/analytics-routes.js';
import { streamRouter } from './routes/stream-routes.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

/**
 * Create and configure Express application
 */
export function createApp(): express.Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow SSE
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  // Body parser
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // API routes (v1)
  app.use('/api/v1/events', eventRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/stream', streamRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
