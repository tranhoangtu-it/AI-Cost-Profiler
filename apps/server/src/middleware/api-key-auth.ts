import type { Request, Response, NextFunction } from 'express';
import { logger } from './error-handler.js';

/**
 * API key authentication middleware
 *
 * Validates the X-API-Key header against configured keys.
 * Set API_KEYS env var as a comma-separated list of valid keys.
 * If API_KEYS is not set, authentication is disabled (development mode).
 *
 * @example
 * // In .env:
 * API_KEYS=key1,key2,key3
 *
 * // In requests:
 * curl -H "X-API-Key: key1" http://localhost:3001/api/v1/events
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredKeys = process.env.API_KEYS;

  // If no API keys configured, skip authentication (development mode)
  if (!configuredKeys) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'Missing API key');
    res.status(401).json({
      error: 'Authentication required',
      message: 'Provide a valid API key via the X-API-Key header',
    });
    return;
  }

  const validKeys = new Set(configuredKeys.split(',').map((k) => k.trim()));

  if (!validKeys.has(apiKey)) {
    logger.warn({ path: req.path, ip: req.ip }, 'Invalid API key');
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
    return;
  }

  next();
}
