import { vi } from 'vitest';

// Mock Redis module
vi.mock('../lib/redis.js', () => ({
  redis: {
    pipeline: () => ({
      incrbyfloat: vi.fn().mockReturnThis(),
      incrby: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    publish: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue('0'),
    keys: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
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
  },
  events: {
    create: vi.fn(),
  },
}));
