import Redis from 'ioredis';
import { logger } from '../middleware/error-handler.js';

/**
 * Redis configuration from environment
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Main Redis client for commands (SET, GET, INCR, etc.)
 */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
});

/**
 * Dedicated subscriber connection for pub/sub
 * Separate connection required per ioredis best practices
 */
export const subscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
});

/**
 * Redis keys for real-time counters
 */
export const REDIS_KEYS = {
  TOTAL_COST: 'realtime:total_cost',
  TOTAL_REQUESTS: 'realtime:total_requests',
  TOTAL_TOKENS: 'realtime:total_tokens',
  SSE_CHANNEL: 'sse:cost_updates',
} as const;

/**
 * Connect both Redis clients
 */
export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), subscriber.connect()]);
}

/**
 * Disconnect both Redis clients
 */
export async function disconnectRedis(): Promise<void> {
  await Promise.all([redis.quit(), subscriber.quit()]);
}

/**
 * Initialize Redis with default values using SETNX (atomic, no race condition)
 * Safe for concurrent server instances starting simultaneously
 */
export async function initializeRedis(): Promise<void> {
  const pipeline = redis.pipeline();

  // SETNX = SET if Not eXists — atomic, prevents TOCTOU race
  pipeline.setnx(REDIS_KEYS.TOTAL_COST, '0');
  pipeline.setnx(REDIS_KEYS.TOTAL_REQUESTS, '0');
  pipeline.setnx(REDIS_KEYS.TOTAL_TOKENS, '0');

  await pipeline.exec();
}

/**
 * Check Redis health — returns true if responsive
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// Error handlers using structured logger
redis.on('error', (err) => {
  logger.error({ err, client: 'main' }, 'Redis client error');
});

subscriber.on('error', (err) => {
  logger.error({ err, client: 'subscriber' }, 'Redis subscriber error');
});
