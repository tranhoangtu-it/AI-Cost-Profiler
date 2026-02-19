import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpenAIInterceptor } from '../providers/openai-interceptor.js';
import type { EventBatcher } from '../transport/event-batcher.js';

describe('Error Tracking - OpenAI Interceptor', () => {
  let mockBatcher: EventBatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatcher = {
      add: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    } as any;
  });

  it('should emit events with isError=true for failed API calls', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 500,
            message: 'Internal server error',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toMatchObject({
      status: 500,
    });

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        errorCode: 'server_error',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 0,
        outputTokens: 0,
      })
    );
  });

  it('should classify 429 errors as rate_limit', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 429,
            message: 'Rate limit exceeded',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'rate_limit',
        isError: true,
      })
    );
  });

  it('should classify 500+ errors as server_error', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 503,
            message: 'Service unavailable',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o-mini', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'server_error',
        isError: true,
        model: 'gpt-4o-mini',
      })
    );
  });

  it('should classify timeout errors as timeout', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            code: 'ETIMEDOUT',
            message: 'Request timeout',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-3.5-turbo', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'timeout',
        isError: true,
      })
    );
  });

  it('should classify 400/401/403 errors as invalid_request', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 401,
            message: 'Invalid API key',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'invalid_request',
        isError: true,
      })
    );
  });

  it('should classify unknown errors as unknown_error', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 418,
            message: "I'm a teapot",
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'unknown_error',
        isError: true,
      })
    );
  });

  it('should track latency for failed calls', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            throw { status: 500, message: 'Error' };
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        latencyMs: expect.any(Number),
      })
    );

    const event = vi.mocked(mockBatcher.add).mock.calls[0][0];
    expect(event.latencyMs).toBeGreaterThan(0);
  });

  it('should include error message in metadata', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Custom error message')),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          error: 'Custom error message',
        },
      })
    );
  });

  it('should track streaming parameter for failed streaming calls', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 500,
            message: 'Error',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [], stream: true })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        isStreaming: true,
        isError: true,
      })
    );
  });

  it('should re-throw the error after tracking', async () => {
    const originalError = { status: 500, message: 'Server error' };

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(originalError),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBe(originalError);
  });

  it('should handle errors with timeout in message', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            message: 'Connection timeout occurred',
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ model: 'gpt-4o', messages: [] })
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'timeout',
        isError: true,
      })
    );
  });

  it('should use unknown model when not specified in params', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 500,
          }),
        },
      },
    };

    const proxied = createOpenAIInterceptor(mockClient as any, mockBatcher, 'test-feature');

    await expect(
      proxied.chat.completions.create({ messages: [] } as any)
    ).rejects.toBeDefined();

    expect(mockBatcher.add).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'unknown',
        isError: true,
      })
    );
  });
});
