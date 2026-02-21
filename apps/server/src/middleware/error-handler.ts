import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import crypto from 'crypto';

/**
 * Logger configuration
 * - Development: pino-pretty for human-readable output
 * - Production: JSON structured logging (no pino-pretty blocking the event loop)
 */
const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export { logger };

/**
 * Application error with HTTP status code
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Request ID middleware — attaches a unique ID to each request for log correlation
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string | undefined;

  // Log error with context
  logger.error({
    err,
    requestId,
    method: req.method,
    path: req.path,
  }, 'Request error');

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.code : undefined;

  // Send error response
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : err.message,
    ...(errorCode && { code: errorCode }),
    ...(requestId && { requestId }),
    ...(isDevelopment && statusCode >= 500 && {
      message: err.message,
      stack: err.stack,
    }),
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
}
