import Redis from 'ioredis';

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
 * Initialize Redis with default values
 */
export async function initializeRedis(): Promise<void> {
  const pipeline = redis.pipeline();

  // Set default counters if not exist
  const exists = await redis.exists(REDIS_KEYS.TOTAL_COST);
  if (!exists) {
    pipeline.set(REDIS_KEYS.TOTAL_COST, '0');
    pipeline.set(REDIS_KEYS.TOTAL_REQUESTS, '0');
    pipeline.set(REDIS_KEYS.TOTAL_TOKENS, '0');
    await pipeline.exec();
  }
}

// Error handlers
redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

subscriber.on('error', (err) => {
  console.error('Redis subscriber error:', err);
});
