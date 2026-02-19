import type { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Requests allowed per window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
}

/**
 * Redis-based rate limiter middleware
 * Uses sliding window counter with automatic TTL
 */
export function createRateLimiter(config: RateLimiterConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract IP from request (handle proxies)
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';

      const key = `${config.keyPrefix}:${ip}`;

      // Increment counter
      const count = await redis.incr(key);

      // Set TTL on first request
      if (count === 1) {
        await redis.expire(key, config.windowSeconds);
      }

      // Get remaining TTL for retry-after header
      const ttl = await redis.ttl(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.limit.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.limit - count).toString());
      res.setHeader('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());

      // Check if limit exceeded
      if (count > config.limit) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${config.limit} per ${config.windowSeconds}s`,
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch (error) {
      // Fail open if Redis is down (log but don't block requests)
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const rateLimiters = {
  /** Analytics endpoints: 1000 req/min */
  analytics: createRateLimiter({
    limit: 1000,
    windowSeconds: 60,
    keyPrefix: 'rate:analytics',
  }),

  /** Event ingestion: 5000 req/min */
  events: createRateLimiter({
    limit: 5000,
    windowSeconds: 60,
    keyPrefix: 'rate:events',
  }),

  /** Export endpoints: 10 req/min (expensive operations) */
  export: createRateLimiter({
    limit: 10,
    windowSeconds: 60,
    keyPrefix: 'rate:export',
  }),
};
