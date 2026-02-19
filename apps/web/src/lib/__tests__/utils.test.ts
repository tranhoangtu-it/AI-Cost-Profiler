import { describe, it, expect } from 'vitest';
import { formatCost, formatTokens, formatLatency } from '../utils.js';

describe('Utils', () => {
  describe('formatCost', () => {
    it('should format costs less than $0.01 with 4 decimals', () => {
      expect(formatCost(0.0001)).toBe('$0.0001');
      expect(formatCost(0.0050)).toBe('$0.0050');
      expect(formatCost(0.0099)).toBe('$0.0099');
    });

    it('should format costs less than $1 with 3 decimals', () => {
      expect(formatCost(0.123)).toBe('$0.123');
      expect(formatCost(0.999)).toBe('$0.999');
      expect(formatCost(0.456)).toBe('$0.456');
    });

    it('should format costs >= $1 with 2 decimals', () => {
      expect(formatCost(1.23)).toBe('$1.23');
      expect(formatCost(10.50)).toBe('$10.50');
      expect(formatCost(999.99)).toBe('$999.99');
    });

    it('should handle null and undefined as $0.0000', () => {
      expect(formatCost(null)).toBe('$0.0000');
      expect(formatCost(undefined)).toBe('$0.0000');
    });

    it('should handle zero', () => {
      expect(formatCost(0)).toBe('$0.0000');
    });

    it('should handle edge case at exactly $0.01', () => {
      expect(formatCost(0.01)).toBe('$0.010');
    });

    it('should handle edge case at exactly $1.00', () => {
      expect(formatCost(1.0)).toBe('$1.00');
    });

    it('should handle very small values', () => {
      expect(formatCost(0.00001)).toBe('$0.0000');
    });

    it('should handle large values', () => {
      expect(formatCost(1234.56)).toBe('$1234.56');
    });
  });

  describe('formatTokens', () => {
    it('should return "0" for 0', () => {
      expect(formatTokens(0)).toBe('0');
    });

    it('should format tokens < 1000 as plain numbers', () => {
      expect(formatTokens(1)).toBe('1');
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(999)).toBe('999');
    });

    it('should format tokens >= 1000 with K suffix', () => {
      expect(formatTokens(1000)).toBe('1.0K');
      expect(formatTokens(1500)).toBe('1.5K');
      expect(formatTokens(2300)).toBe('2.3K');
      expect(formatTokens(999999)).toBe('1000.0K');
    });

    it('should format tokens >= 1,000,000 with M suffix', () => {
      expect(formatTokens(1000000)).toBe('1.0M');
      expect(formatTokens(2300000)).toBe('2.3M');
      expect(formatTokens(5600000)).toBe('5.6M');
    });

    it('should handle null and undefined as 0', () => {
      expect(formatTokens(null)).toBe('0');
      expect(formatTokens(undefined)).toBe('0');
    });

    it('should handle edge cases', () => {
      expect(formatTokens(1001)).toBe('1.0K');
      expect(formatTokens(1499)).toBe('1.5K');
      expect(formatTokens(1500000)).toBe('1.5M');
    });

    it('should round to 1 decimal place', () => {
      expect(formatTokens(1234)).toBe('1.2K');
      expect(formatTokens(1567)).toBe('1.6K');
      expect(formatTokens(1234567)).toBe('1.2M');
    });
  });

  describe('formatLatency', () => {
    it('should format latency < 1000ms with ms suffix', () => {
      expect(formatLatency(0)).toBe('0ms');
      expect(formatLatency(250)).toBe('250ms');
      expect(formatLatency(999)).toBe('999ms');
    });

    it('should format latency >= 1000ms with s suffix', () => {
      expect(formatLatency(1000)).toBe('1.0s');
      expect(formatLatency(1500)).toBe('1.5s');
      expect(formatLatency(2300)).toBe('2.3s');
      expect(formatLatency(5678)).toBe('5.7s');
    });

    it('should handle null and undefined as 0ms', () => {
      expect(formatLatency(null)).toBe('0ms');
      expect(formatLatency(undefined)).toBe('0ms');
    });

    it('should round ms values to nearest integer', () => {
      expect(formatLatency(123.7)).toBe('124ms');
      expect(formatLatency(456.2)).toBe('456ms');
    });

    it('should format seconds with 1 decimal place', () => {
      expect(formatLatency(1234)).toBe('1.2s');
      expect(formatLatency(9876)).toBe('9.9s');
    });

    it('should handle edge case at exactly 1000ms', () => {
      expect(formatLatency(1000)).toBe('1.0s');
    });

    it('should handle very large values', () => {
      expect(formatLatency(60000)).toBe('60.0s');
      expect(formatLatency(123456)).toBe('123.5s');
    });
  });
});
