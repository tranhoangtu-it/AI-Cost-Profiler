import { describe, it, expect } from 'vitest';
import { generateTraceId, generateSpanId } from '../utils/id-generator.js';

describe('id-generator', () => {
  describe('generateTraceId', () => {
    it('should generate trace ID with tr_ prefix', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^tr_/);
    });

    it('should generate 21-char nanoid after prefix', () => {
      const traceId = generateTraceId();
      const suffix = traceId.slice(3); // Remove 'tr_'
      expect(suffix).toHaveLength(21);
    });

    it('should generate unique trace IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with alphanumeric characters', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^tr_[a-zA-Z0-9_-]+$/);
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSpanId', () => {
    it('should generate span ID with sp_ prefix', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^sp_/);
    });

    it('should generate 16-char nanoid after prefix', () => {
      const spanId = generateSpanId();
      const suffix = spanId.slice(3); // Remove 'sp_'
      expect(suffix).toHaveLength(16);
    });

    it('should generate unique span IDs', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with alphanumeric characters', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^sp_[a-zA-Z0-9_-]+$/);
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('trace and span ID uniqueness', () => {
    it('should generate different trace and span IDs', () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      expect(traceId).not.toBe(spanId);
    });

    it('should generate shorter span IDs than trace IDs', () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      expect(spanId.length).toBeLessThan(traceId.length);
    });
  });
});
