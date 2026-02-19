/**
 * Shared error classifier for all LLM providers
 * Maps API errors to standard error codes for telemetry
 */

/**
 * Classify an API error into a standard error code
 * Works for OpenAI, Anthropic, and Gemini providers
 */
export function classifyApiError(error: unknown): string {
  const err = error as Record<string, unknown>;
  const status = err.status as number | undefined;
  const code = err.code as string | undefined;
  const message = (err.message as string) ?? '';

  if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
    return 'rate_limit';
  }

  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return 'timeout';
  }

  if (status === 503 || message.includes('UNAVAILABLE') || (status && status >= 500)) {
    return 'server_error';
  }

  if (status === 400 || status === 401 || status === 403 || message.includes('INVALID_ARGUMENT')) {
    return 'invalid_request';
  }

  return 'unknown_error';
}
