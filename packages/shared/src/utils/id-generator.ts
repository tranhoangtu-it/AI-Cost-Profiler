import { nanoid } from 'nanoid';

/**
 * Generate unique trace ID with 'tr_' prefix
 * Trace IDs are used to group related LLM calls across a single user action
 * @returns Trace ID in format: tr_{21-char-nanoid}
 */
export function generateTraceId(): string {
  return `tr_${nanoid(21)}`;
}

/**
 * Generate unique span ID with 'sp_' prefix
 * Span IDs uniquely identify individual LLM API calls within a trace
 * @returns Span ID in format: sp_{16-char-nanoid}
 */
export function generateSpanId(): string {
  return `sp_${nanoid(16)}`;
}
