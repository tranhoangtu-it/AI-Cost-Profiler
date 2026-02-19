import type { Provider } from '@ai-cost-profiler/shared';

/**
 * Detect LLM provider from client object structure
 * @param client OpenAI, Anthropic, or Gemini client instance
 * @returns Provider type
 * @throws Error if client is not supported
 */
export function detectProvider(client: unknown): Provider {
  if (typeof client !== 'object' || client === null) {
    throw new Error('Client must be a valid object');
  }

  const clientObj = client as Record<string, unknown>;

  // OpenAI clients have a 'chat' property
  if ('chat' in clientObj && typeof clientObj.chat === 'object') {
    return 'openai';
  }

  // Anthropic clients have a 'messages' property
  if ('messages' in clientObj && typeof clientObj.messages === 'object') {
    return 'anthropic';
  }

  // Gemini clients have 'generateContent' method (GenerativeModel instance)
  // or 'getGenerativeModel' method (@google/generative-ai or @google-cloud/vertexai)
  if (
    ('generateContent' in clientObj && typeof clientObj.generateContent === 'function') ||
    ('getGenerativeModel' in clientObj && typeof clientObj.getGenerativeModel === 'function')
  ) {
    return 'google-gemini';
  }

  throw new Error(
    'Unsupported client: must be OpenAI, Anthropic, or Google Gemini SDK instance'
  );
}
