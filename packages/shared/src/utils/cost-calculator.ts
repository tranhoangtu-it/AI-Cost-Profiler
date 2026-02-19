import { MODEL_PRICING, DEFAULT_PRICING } from '../constants/model-pricing.js';
import type { ModelPricing } from '../types/index.js';

/**
 * Calculate cost for LLM API call with 6 decimal precision
 * @param model Model identifier
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param cachedTokens Number of cached input tokens (optional)
 * @returns Estimated cost in USD
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const pricing = lookupPricing(model) ?? DEFAULT_PRICING;

  // Calculate regular input tokens (excluding cached)
  const regularInputTokens = Math.max(0, inputTokens - cachedTokens);

  // Calculate costs per component
  const inputCost = (regularInputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cachedCost = pricing.cachedInputPer1M
    ? (cachedTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0;

  // Sum and round to 6 decimal places
  const totalCost = inputCost + outputCost + cachedCost;
  return parseFloat(totalCost.toFixed(6));
}

/**
 * Lookup pricing information for a model
 * @param model Model identifier
 * @returns ModelPricing object or null if not found
 */
export function lookupPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Get all available models grouped by provider
 * @returns Record of provider to model names
 */
export function getModelsByProvider(): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const [modelName, pricing] of Object.entries(MODEL_PRICING)) {
    const provider = pricing.provider;
    if (!grouped[provider]) {
      grouped[provider] = [];
    }
    grouped[provider].push(modelName);
  }

  return grouped;
}
