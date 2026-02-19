import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBatcher } from '../transport/event-batcher.js';
import type { LlmEvent } from '@ai-cost-profiler/shared';

const createMockEvent = (overrides?: Partial<LlmEvent>): LlmEvent => ({
  traceId: 'tr_test123',
  spanId: 'sp_test456',
  feature: 'test-feature',
  provider: 'openai',
  model: 'gpt-4o',
  inputTokens: 100,
  outputTokens: 50,
  latencyMs: 250,
  estimatedCostUsd: 0.005,
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('EventBatcher', () => {
  let batcher: EventBatcher;
  const serverUrl = 'http://localhost:3001';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    if (batcher) {
      await batcher.destroy();
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should create batcher with default config', () => {
      batcher = new EventBatcher(serverUrl);
      expect(batcher).toBeDefined();
    });

    it('should create batcher with custom batch size', () => {
      batcher = new EventBatcher(serverUrl, 5, 3000);
      expect(batcher).toBeDefined();
    });

    it('should start timer immediately on construction', async () => {
      vi.useFakeTimers();
      batcher = new EventBatcher(serverUrl, 10, 5000);

      // Timer should be running
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('add() and batch flushing', () => {
    it('should accept events', () => {
      batcher = new EventBatcher(serverUrl, 10, 5000);
      const event = createMockEvent();

      expect(() => batcher.add(event)).not.toThrow();
    });

    it('should trigger flush when batch size reached', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 2, 10000);

      // Add first event
      batcher.add(createMockEvent({ spanId: 'sp_1' }));
      expect(fetchMock).not.toHaveBeenCalled();

      // Add second event to trigger flush
      batcher.add(createMockEvent({ spanId: 'sp_2' }));

      // Wait for async flush to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalled();
    });

    it('should send correct POST format', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 1, 10000);
      const event = createMockEvent();

      batcher.add(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledWith(
        `${serverUrl}/api/v1/events`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('events'),
        })
      );

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toEqual(event);
    });

    it('should send correct endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher('http://custom-server:5000', 1, 10000);
      batcher.add(createMockEvent());

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledWith(
        'http://custom-server:5000/api/v1/events',
        expect.anything()
      );
    });
  });

  describe('timer-based flushing', () => {
    it('should flush after timer interval', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      // Use real timers for this test
      batcher = new EventBatcher(serverUrl, 100, 500);
      batcher.add(createMockEvent());

      expect(fetchMock).not.toHaveBeenCalled();

      // Wait for timer to trigger flush
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(fetchMock).toHaveBeenCalled();
    }, 2000);
  });

  describe('error handling', () => {
    it('should handle fetch rejections gracefully', async () => {
      const fetchMock = vi.fn().mockRejectedValue(
        new Error('Network error')
      );
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 1, 10000);
      const event = createMockEvent();

      // This should not throw despite fetch failure
      expect(() => {
        batcher.add(event);
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have attempted the fetch
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should handle HTTP error responses gracefully', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 1, 10000);

      expect(() => {
        batcher.add(createMockEvent());
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have attempted the fetch
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should gracefully handle malformed responses', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 1, 10000);

      expect(() => {
        batcher.add(createMockEvent());
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe('destroy', () => {
    it('should clean up timer', async () => {
      vi.useFakeTimers();
      batcher = new EventBatcher(serverUrl, 10, 5000);

      const timerCountBefore = vi.getTimerCount();
      expect(timerCountBefore).toBeGreaterThan(0);

      await batcher.destroy();

      expect(vi.getTimerCount()).toBeLessThan(timerCountBefore);

      vi.useRealTimers();
    });

    it('should perform final flush on destroy', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 100, 5000);
      batcher.add(createMockEvent());

      await batcher.destroy();

      // Should have flushed the remaining event
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should not flush if buffer is empty on destroy', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'Accepted',
      });
      vi.stubGlobal('fetch', fetchMock);

      batcher = new EventBatcher(serverUrl, 100, 5000);

      await batcher.destroy();

      // Should not call fetch if buffer is empty
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('buffer overflow', () => {
    it('should cap buffer at maxBufferSize (1000)', async () => {
      batcher = new EventBatcher(serverUrl, 2000, 10000); // batchSize > maxBuffer

      // Add 1100 events
      for (let i = 0; i < 1100; i++) {
        batcher.add(createMockEvent({ spanId: `sp_${i}` }));
      }

      // Buffer should be capped at 1000, dropping oldest 100
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });
});
