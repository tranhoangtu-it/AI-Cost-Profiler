import { describe, it, expect } from 'vitest';
import { llmEventSchema, batchEventRequestSchema } from '../schemas/event-schema.js';

describe('event-schema', () => {
  const validEvent = {
    traceId: 'tr_abc123',
    spanId: 'sp_def456',
    feature: 'chat-completion',
    provider: 'openai' as const,
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 250,
    estimatedCostUsd: 0.005,
    timestamp: new Date().toISOString(),
  };

  describe('llmEventSchema', () => {
    it('should validate a correct event', () => {
      const result = llmEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should accept optional userId field', () => {
      const event = { ...validEvent, userId: 'user-123' };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should accept optional parentSpanId field', () => {
      const event = { ...validEvent, parentSpanId: 'sp_parent123' };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should default cachedTokens to 0', () => {
      const result = llmEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cachedTokens).toBe(0);
      }
    });

    it('should accept explicit cachedTokens', () => {
      const event = { ...validEvent, cachedTokens: 25 };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cachedTokens).toBe(25);
      }
    });

    it('should reject negative inputTokens', () => {
      const event = { ...validEvent, inputTokens: -100 };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject negative outputTokens', () => {
      const event = { ...validEvent, outputTokens: -50 };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject invalid provider', () => {
      const event = { ...validEvent, provider: 'invalid-provider' };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should accept all valid providers', () => {
      const providers = ['openai', 'anthropic', 'google-gemini'] as const;
      for (const provider of providers) {
        const event = { ...validEvent, provider };
        const result = llmEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject missing traceId', () => {
      const { traceId, ...eventWithoutTrace } = validEvent;
      const result = llmEventSchema.safeParse(eventWithoutTrace);
      expect(result.success).toBe(false);
    });

    it('should reject missing spanId', () => {
      const { spanId, ...eventWithoutSpan } = validEvent;
      const result = llmEventSchema.safeParse(eventWithoutSpan);
      expect(result.success).toBe(false);
    });

    it('should reject negative latencyMs', () => {
      const event = { ...validEvent, latencyMs: -100 };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject negative estimatedCostUsd', () => {
      const event = { ...validEvent, estimatedCostUsd: -0.01 };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should accept optional metadata field', () => {
      const event = {
        ...validEvent,
        metadata: { customKey: 'customValue', count: 42 },
      };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should accept empty traceId (just min 1 char)', () => {
      const event = { ...validEvent, traceId: 'x' };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should reject empty traceId', () => {
      const event = { ...validEvent, traceId: '' };
      const result = llmEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('batchEventRequestSchema', () => {
    it('should validate a valid batch request', () => {
      const batch = { events: [validEvent] };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });

    it('should accept multiple events', () => {
      const batch = {
        events: [validEvent, validEvent, validEvent],
      };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });

    it('should reject empty events array', () => {
      const batch = { events: [] };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it('should reject batch larger than 500 events', () => {
      const events = Array(501).fill(validEvent);
      const batch = { events };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });

    it('should accept batch with exactly 500 events', () => {
      const events = Array(500).fill(validEvent);
      const batch = { events };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });

    it('should reject invalid event in batch', () => {
      const batch = {
        events: [validEvent, { ...validEvent, inputTokens: -100 }],
      };
      const result = batchEventRequestSchema.safeParse(batch);
      expect(result.success).toBe(false);
    });
  });
});
