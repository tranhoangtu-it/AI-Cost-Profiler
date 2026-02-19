import type { ModelPricing } from '../types/index.js';

/**
 * Comprehensive model pricing database (per 1M tokens)
 * Updated as of February 2026
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': {
    model: 'gpt-4o',
    provider: 'openai',
    inputPer1M: 2.50,
    outputPer1M: 10.00,
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    provider: 'openai',
    inputPer1M: 0.15,
    outputPer1M: 0.60,
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    provider: 'openai',
    inputPer1M: 10.00,
    outputPer1M: 30.00,
  },
  'gpt-3.5-turbo': {
    model: 'gpt-3.5-turbo',
    provider: 'openai',
    inputPer1M: 0.50,
    outputPer1M: 1.50,
  },
  'text-embedding-3-small': {
    model: 'text-embedding-3-small',
    provider: 'openai',
    inputPer1M: 0.02,
    outputPer1M: 0.00,
  },
  'text-embedding-3-large': {
    model: 'text-embedding-3-large',
    provider: 'openai',
    inputPer1M: 0.13,
    outputPer1M: 0.00,
  },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': {
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cachedInputPer1M: 0.30,
  },
  'claude-3-5-haiku-20241022': {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    cachedInputPer1M: 0.10,
  },
  'claude-3-opus-20240229': {
    model: 'claude-3-opus-20240229',
    provider: 'anthropic',
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cachedInputPer1M: 1.50,
  },
  'claude-sonnet-4-20250514': {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cachedInputPer1M: 0.30,
  },

  // Google Gemini Models
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    provider: 'google-gemini',
    inputPer1M: 1.25,
    outputPer1M: 5.00,
    cachedInputPer1M: 0.3125,
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    provider: 'google-gemini',
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    cachedInputPer1M: 0.01875,
  },
  'gemini-1.0-pro': {
    model: 'gemini-1.0-pro',
    provider: 'google-gemini',
    inputPer1M: 0.50,
    outputPer1M: 1.50,
  },
};

/**
 * Fallback pricing for unknown models (conservative estimate)
 */
export const DEFAULT_PRICING: ModelPricing = {
  model: 'unknown',
  provider: 'openai',
  inputPer1M: 10.00,
  outputPer1M: 30.00,
};
