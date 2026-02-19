import { vi } from 'vitest';

// Mock Redis module
vi.mock('../lib/redis.js', () => ({
  redis: {
    pipeline: () => ({
      incrbyfloat: vi.fn().mockReturnThis(),
      incrby: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    multi: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
    }),
    publish: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue('0'),
    keys: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
    setex: vi.fn().mockResolvedValue('OK'),
  },
  redisSub: {
    subscribe: vi.fn(),
    on: vi.fn(),
  },
  REDIS_KEYS: {
    TOTAL_COST: 'metrics:total_cost',
    TOTAL_REQUESTS: 'metrics:total_requests',
    TOTAL_TOKENS: 'metrics:total_tokens',
    SSE_CHANNEL: 'sse:updates',
  },
}));

// Mock database module
vi.mock('../db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    select: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(),
  },
  events: {
    create: vi.fn(),
  },
}));
