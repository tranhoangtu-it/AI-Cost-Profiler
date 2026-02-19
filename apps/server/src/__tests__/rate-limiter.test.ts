import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { redis } from '../lib/redis.js';
import type { Request, Response, NextFunction } from 'express';

describe('Rate Limiter', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  it('should allow requests under limit', async () => {
    vi.mocked(redis.incr).mockResolvedValue(5);
    vi.mocked(redis.ttl).mockResolvedValue(60);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should block requests over limit with 429 status', async () => {
    vi.mocked(redis.incr).mockResolvedValue(101);
    vi.mocked(redis.ttl).mockResolvedValue(30);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Limit: 100 per 60s',
      retryAfter: 30,
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should set rate limit headers', async () => {
    vi.mocked(redis.incr).mockResolvedValue(25);
    vi.mocked(redis.ttl).mockResolvedValue(45);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '75');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('should set remaining to 0 when over limit', async () => {
    vi.mocked(redis.incr).mockResolvedValue(150);
    vi.mocked(redis.ttl).mockResolvedValue(30);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('should set TTL on first request', async () => {
    vi.mocked(redis.incr).mockResolvedValue(1);
    vi.mocked(redis.ttl).mockResolvedValue(60);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('test:'), 60);
  });

  it('should not set TTL on subsequent requests', async () => {
    vi.mocked(redis.incr).mockResolvedValue(5);
    vi.mocked(redis.ttl).mockResolvedValue(55);

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('should extract IP from x-forwarded-for header', async () => {
    vi.mocked(redis.incr).mockResolvedValue(1);
    vi.mocked(redis.ttl).mockResolvedValue(60);

    mockReq.headers = { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' };

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(redis.incr).toHaveBeenCalledWith('test:203.0.113.1');
  });

  it('should use socket address when x-forwarded-for is missing', async () => {
    vi.mocked(redis.incr).mockResolvedValue(1);
    vi.mocked(redis.ttl).mockResolvedValue(60);

    mockReq.socket = { remoteAddress: '192.168.1.100' } as any;

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(redis.incr).toHaveBeenCalledWith('test:192.168.1.100');
  });

  it('should fail open when Redis errors', async () => {
    vi.mocked(redis.incr).mockRejectedValue(new Error('Redis connection failed'));

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should handle unknown IP gracefully', async () => {
    vi.mocked(redis.incr).mockResolvedValue(1);
    vi.mocked(redis.ttl).mockResolvedValue(60);

    mockReq.headers = {};
    mockReq.socket = {} as any;

    const limiter = createRateLimiter({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: 'test',
    });

    await limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(redis.incr).toHaveBeenCalledWith('test:unknown');
    expect(mockNext).toHaveBeenCalled();
  });
});
