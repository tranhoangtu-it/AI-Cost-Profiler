import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { processEventBatch } from '../services/event-processor.js';
import type { LlmEvent } from '@ai-cost-profiler/shared';

// Mock the event processor
vi.mock('../services/event-processor.js', () => ({
  processEventBatch: vi.fn().mockResolvedValue(undefined),
}));

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

describe('Event Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with ok status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return ISO timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/
      );
    });
  });

  describe('POST /api/v1/events', () => {
    it('should accept valid batch and return 202', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent()],
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('count', 1);
    });

    it('should process batch through event processor', async () => {
      const event = createMockEvent();

      await request(app)
        .post('/api/v1/events')
        .send({
          events: [event],
        });

      expect(processEventBatch).toHaveBeenCalled();
      const callArgs = vi.mocked(processEventBatch).mock.calls[0];
      expect(callArgs[0]).toHaveLength(1);
      expect(callArgs[0][0]).toMatchObject({
        traceId: event.traceId,
        spanId: event.spanId,
        feature: event.feature,
        provider: event.provider,
        model: event.model,
      });
    });

    it('should accept multiple events in batch', async () => {
      const events = [
        createMockEvent({ spanId: 'sp_1' }),
        createMockEvent({ spanId: 'sp_2' }),
        createMockEvent({ spanId: 'sp_3' }),
      ];

      const response = await request(app)
        .post('/api/v1/events')
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.count).toBe(3);
      expect(processEventBatch).toHaveBeenCalled();
      const callArgs = vi.mocked(processEventBatch).mock.calls[0];
      expect(callArgs[0]).toHaveLength(3);
    });

    it('should reject empty events array', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [],
        });

      expect(response.status).toBe(400);
    });

    it('should reject missing events field', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should reject batch larger than 500 events', async () => {
      const events = Array(501).fill(createMockEvent());

      const response = await request(app)
        .post('/api/v1/events')
        .send({ events });

      expect(response.status).toBe(400);
    });

    it('should accept batch with exactly 500 events', async () => {
      const events = Array(500).fill(createMockEvent());

      const response = await request(app)
        .post('/api/v1/events')
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.count).toBe(500);
    });

    it('should reject event with negative inputTokens', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent({ inputTokens: -100 })],
        });

      expect(response.status).toBe(400);
    });

    it('should reject event with negative outputTokens', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent({ outputTokens: -50 })],
        });

      expect(response.status).toBe(400);
    });

    it('should reject event with invalid provider', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [
            {
              ...createMockEvent(),
              provider: 'invalid-provider',
            },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('should accept optional userId field', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent({ userId: 'user-123' })],
        });

      expect(response.status).toBe(202);
    });

    it('should accept optional parentSpanId field', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent({ parentSpanId: 'sp_parent' })],
        });

      expect(response.status).toBe(202);
    });

    it('should accept optional metadata field', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [
            createMockEvent({
              metadata: { customKey: 'customValue' },
            }),
          ],
        });

      expect(response.status).toBe(202);
    });

    it('should handle processor errors gracefully', async () => {
      vi.mocked(processEventBatch).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent()],
        });

      expect(response.status).toBe(500);
    });

    it('should have correct Content-Type', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .send({
          events: [createMockEvent()],
        });

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should reject non-JSON body', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .set('Content-Type', 'text/plain')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/v1/unknown');

      expect(response.status).toBe(404);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .post('/api/v1/events')
        .set('Origin', 'http://localhost:3000')
        .send({
          events: [createMockEvent()],
        });

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});
