import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGeminiInterceptor } from '../providers/gemini-interceptor.js';
import type { EventBatcher } from '../transport/event-batcher.js';

describe('Gemini Interceptor', () => {
  let mockBatcher: EventBatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatcher = {
      add: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    } as any;
  });

  describe('generateContent', () => {
    it('should capture usage metrics', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockResolvedValue({
          response: {
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 50,
              totalTokenCount: 150,
              cachedContentTokenCount: 0,
            },
          },
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature', 'user-123');
      await proxied.generateContent('test prompt');

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google-gemini',
          model: 'gemini-1.5-flash',
          inputTokens: 100,
          outputTokens: 50,
          cachedTokens: 0,
          feature: 'test-feature',
          userId: 'user-123',
          isStreaming: false,
          isError: false,
        })
      );
    });

    it('should track errors with correct error codes', async () => {
      const mockModel = {
        model: 'gemini-1.5-pro',
        generateContent: vi.fn().mockRejectedValue({
          status: 429,
          message: 'RESOURCE_EXHAUSTED',
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toMatchObject({
        status: 429,
      });

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google-gemini',
          model: 'gemini-1.5-pro',
          isError: true,
          errorCode: 'rate_limit',
          inputTokens: 0,
          outputTokens: 0,
        })
      );
    });

    it('should handle missing usage metadata', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockResolvedValue({
          response: {
            // No usageMetadata
          },
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');
      await proxied.generateContent('test');

      // Should not add event if no usage data
      expect(mockBatcher.add).not.toHaveBeenCalled();
    });

    it('should use default model name when not specified', async () => {
      const mockModel = {
        // No model property
        generateContent: vi.fn().mockResolvedValue({
          response: {
            usageMetadata: {
              promptTokenCount: 50,
              candidatesTokenCount: 25,
            },
          },
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');
      await proxied.generateContent('test');

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-1.5-flash', // Default
        })
      );
    });

    it('should track latency', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            response: {
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 10,
              },
            },
          };
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');
      await proxied.generateContent('test');

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          latencyMs: expect.any(Number),
        })
      );

      const event = vi.mocked(mockBatcher.add).mock.calls[0][0];
      expect(event.latencyMs).toBeGreaterThan(50);
    });

    it('should handle cached tokens', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockResolvedValue({
          response: {
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 50,
              cachedContentTokenCount: 30,
            },
          },
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');
      await proxied.generateContent('test');

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          cachedTokens: 30,
        })
      );
    });
  });

  describe('getGenerativeModel proxy', () => {
    it('should work for non-model clients', () => {
      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue({
          model: 'gemini-1.5-pro',
          generateContent: vi.fn().mockResolvedValue({
            response: {
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 10,
              },
            },
          }),
        }),
      };

      const proxied = createGeminiInterceptor(mockClient, mockBatcher, 'test-feature');
      const model = proxied.getGenerativeModel({ model: 'gemini-1.5-pro' });

      expect(mockClient.getGenerativeModel).toHaveBeenCalled();
      expect(model).toBeDefined();
    });

    it('should intercept model returned from getGenerativeModel', async () => {
      const mockModel = {
        model: 'gemini-2.0-flash-exp',
        generateContent: vi.fn().mockResolvedValue({
          response: {
            usageMetadata: {
              promptTokenCount: 20,
              candidatesTokenCount: 15,
            },
          },
        }),
      };

      const mockClient = {
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      };

      const proxied = createGeminiInterceptor(mockClient, mockBatcher, 'test-feature');
      const model = proxied.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      await model.generateContent('test');

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.0-flash-exp',
        })
      );
    });
  });

  describe('classifyGeminiError', () => {
    it('should classify rate limit errors', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockRejectedValue({
          status: 429,
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toBeDefined();

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'rate_limit',
        })
      );
    });

    it('should classify server errors', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockRejectedValue({
          status: 503,
          message: 'UNAVAILABLE',
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toBeDefined();

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'server_error',
        })
      );
    });

    it('should classify timeout errors', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockRejectedValue({
          code: 'ETIMEDOUT',
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toBeDefined();

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'timeout',
        })
      );
    });

    it('should classify invalid request errors', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockRejectedValue({
          status: 400,
          message: 'INVALID_ARGUMENT',
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toBeDefined();

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'invalid_request',
        })
      );
    });

    it('should classify unknown errors', async () => {
      const mockModel = {
        model: 'gemini-1.5-flash',
        generateContent: vi.fn().mockRejectedValue({
          status: 418,
          message: 'I am a teapot',
        }),
      };

      const proxied = createGeminiInterceptor(mockModel, mockBatcher, 'test-feature');

      await expect(proxied.generateContent('test')).rejects.toBeDefined();

      expect(mockBatcher.add).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'unknown_error',
        })
      );
    });
  });
});
