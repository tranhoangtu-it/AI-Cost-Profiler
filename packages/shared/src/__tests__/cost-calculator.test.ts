import { describe, it, expect } from 'vitest';
import { calculateCost, lookupPricing } from '../utils/cost-calculator.js';

describe('cost-calculator', () => {
  describe('calculateCost', () => {
    it('should calculate gpt-4o cost correctly (1000 input, 500 output)', () => {
      // gpt-4o: inputPer1M=2.50, outputPer1M=10.00
      // Cost = (1000/1M)*2.50 + (500/1M)*10.00 = 0.0025 + 0.005 = 0.0075
      const cost = calculateCost('gpt-4o', 1000, 500);
      expect(cost).toBe(0.0075);
    });

    it('should calculate claude-3-5-sonnet cost correctly', () => {
      // claude-3-5-sonnet: inputPer1M=3.00, outputPer1M=15.00
      // Cost = (1000/1M)*3.00 + (500/1M)*15.00 = 0.003 + 0.0075 = 0.0105
      const cost = calculateCost('claude-3-5-sonnet-20241022', 1000, 500);
      expect(cost).toBe(0.0105);
    });

    it('should handle cached tokens for Claude models', () => {
      // claude-3-5-sonnet: inputPer1M=3.00, outputPer1M=15.00, cachedInputPer1M=0.30
      // With cachedTokens=200, regularInput=800
      // Cost = (800/1M)*3.00 + (500/1M)*15.00 + (200/1M)*0.30
      //      = 0.0024 + 0.0075 + 0.00006 = 0.00996
      const cost = calculateCost('claude-3-5-sonnet-20241022', 1000, 500, 200);
      expect(cost).toBeCloseTo(0.00996, 5);
    });

    it('should use DEFAULT_PRICING for unknown models (not zero)', () => {
      // DEFAULT_PRICING: inputPer1M=10.00, outputPer1M=30.00
      // Cost = (1000/1M)*10 + (500/1M)*30 = 0.01 + 0.015 = 0.025
      const cost = calculateCost('unknown-model', 1000, 500);
      expect(cost).toBe(0.025);
    });

    it('should return 0 cost for zero tokens', () => {
      const cost = calculateCost('gpt-4o', 0, 0);
      expect(cost).toBe(0);
    });

    it('should return 6 decimal precision', () => {
      // Verify precision
      const cost = calculateCost('gpt-4o', 123, 456);
      const decimalPlaces = (cost.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });

    it('should handle large token counts', () => {
      // 1M input tokens, 1M output tokens on gpt-4o
      // Cost = (1M/1M)*2.50 + (1M/1M)*10.00 = 2.50 + 10.00 = 12.50
      const cost = calculateCost('gpt-4o', 1_000_000, 1_000_000);
      expect(cost).toBe(12.50);
    });

    it('should handle negative cached tokens gracefully (max with 0)', () => {
      // Cached tokens should not exceed input tokens
      const cost = calculateCost('claude-3-5-sonnet-20241022', 100, 50, 200);
      // regularInputTokens = max(0, 100 - 200) = 0
      // Cost = (0/1M)*3.00 + (50/1M)*15.00 + (200/1M)*0.30
      //      = 0 + 0.00075 + 0.00006 = 0.00081
      expect(cost).toBeCloseTo(0.00081, 5);
    });
  });

  describe('lookupPricing', () => {
    it('should return correct pricing for gpt-4o', () => {
      const pricing = lookupPricing('gpt-4o');
      expect(pricing).not.toBeNull();
      expect(pricing?.model).toBe('gpt-4o');
      expect(pricing?.provider).toBe('openai');
      expect(pricing?.inputPer1M).toBe(2.50);
      expect(pricing?.outputPer1M).toBe(10.00);
      expect(pricing?.cachedInputPer1M).toBeUndefined();
    });

    it('should return correct pricing for claude-3-5-sonnet with cache', () => {
      const pricing = lookupPricing('claude-3-5-sonnet-20241022');
      expect(pricing).not.toBeNull();
      expect(pricing?.model).toBe('claude-3-5-sonnet-20241022');
      expect(pricing?.provider).toBe('anthropic');
      expect(pricing?.inputPer1M).toBe(3.00);
      expect(pricing?.outputPer1M).toBe(15.00);
      expect(pricing?.cachedInputPer1M).toBe(0.30);
    });

    it('should return null for unknown model', () => {
      const pricing = lookupPricing('unknown-model-xyz');
      expect(pricing).toBeNull();
    });

    it('should have correct field names (inputPer1M, not inputPricePer1k)', () => {
      const pricing = lookupPricing('gpt-4o');
      expect(pricing).toHaveProperty('inputPer1M');
      expect(pricing).toHaveProperty('outputPer1M');
      expect(pricing).not.toHaveProperty('inputPricePer1k');
      expect(pricing).not.toHaveProperty('outputPricePer1k');
    });
  });
});
