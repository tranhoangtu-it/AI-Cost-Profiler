import { db, events } from '../db/index.js';
import { redis } from '../lib/redis.js';
import { logger, AppError } from '../middleware/error-handler.js';
import { sql, eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Similar prompt result
 */
export interface SimilarPrompt {
  id: string;
  promptHash: string;
  content: string;
  feature: string | null;
  model: string;
  similarity: number;
  occurrences: number;
  totalCostUsd: number;
}

/**
 * Generate hash for prompt text (for grouping similar prompts)
 */
function generatePromptHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Find similar prompts using hash-based grouping
 * Note: This is a fallback implementation. For production, use pgvector with embeddings.
 */
export async function findSimilarPrompts(
  eventId: string,
  _threshold: number = 0.8, // Reserved for pgvector cosine similarity implementation
  limit: number = 10
): Promise<SimilarPrompt[]> {
  try {
    // Fetch the original event
    const originalEvent = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (originalEvent.length === 0) {
      throw new AppError('Event not found', 404);
    }

    const event = originalEvent[0]!;
    const promptText = JSON.stringify(event.metadata || {});
    const promptHash = generatePromptHash(promptText);

    // Cache key for similarity results
    const cacheKey = `similarity:${eventId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // For MVP: Use hash-based grouping to find exact duplicates and similar patterns
    // In production: Replace with pgvector cosine similarity using embeddings
    const result = await db.execute(sql`
      WITH prompt_groups AS (
        SELECT
          id,
          MD5(metadata::text) as prompt_hash,
          SUBSTRING(metadata::text, 1, 100) as content,
          feature,
          model,
          COUNT(*) as occurrences,
          SUM(CAST(verified_cost_usd AS NUMERIC)) as total_cost_usd
        FROM events
        WHERE metadata IS NOT NULL
          AND id != ${eventId}
        GROUP BY id, MD5(metadata::text), SUBSTRING(metadata::text, 1, 100), feature, model
      )
      SELECT
        id,
        prompt_hash,
        content,
        feature,
        model,
        occurrences,
        total_cost_usd,
        -- Similarity based on hash match (1.0 for exact, 0.0 for different)
        CASE
          WHEN prompt_hash = ${promptHash} THEN 1.0
          ELSE 0.0
        END as similarity
      FROM prompt_groups
      WHERE prompt_hash = ${promptHash}
      ORDER BY total_cost_usd DESC
      LIMIT ${limit}
    `);

    const similarPrompts: SimilarPrompt[] = result.rows.map((row: any) => ({
      id: row.id,
      promptHash: row.prompt_hash,
      content: row.content,
      feature: row.feature,
      model: row.model,
      similarity: parseFloat(row.similarity),
      occurrences: parseInt(row.occurrences),
      totalCostUsd: parseFloat(row.total_cost_usd || '0'),
    }));

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(similarPrompts));

    return similarPrompts;
  } catch (error) {
    logger.error({ error, eventId }, 'Error finding similar prompts');
    if (error instanceof AppError) throw error;
    throw new AppError('Failed to find similar prompts', 500);
  }
}

/**
 * Get prompt analysis with similarity detection
 */
export async function getPromptAnalysisWithSimilarity(
  from: string,
  to: string,
  limit: number = 20
): Promise<Array<{
  promptHash: string;
  content: string;
  occurrences: number;
  totalCostUsd: number;
  avgTokens: number;
  similarCount: number;
}>> {
  // Calculate median input tokens for baseline
  const medianResult = await db.execute(sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY input_tokens) as median_tokens
    FROM events
    WHERE created_at >= ${from}
      AND created_at <= ${to}
  `);

  const medianTokens = parseFloat((medianResult.rows[0] as any).median_tokens || '0');
  const bloatThreshold = Math.floor(medianTokens * 1.5);

  // Find prompts with high token usage
  const result = await db.execute(sql`
    WITH prompt_stats AS (
      SELECT
        MD5(metadata::text) as prompt_hash,
        SUBSTRING(metadata::text, 1, 100) as content,
        COUNT(*) as occurrences,
        SUM(CAST(verified_cost_usd AS NUMERIC)) as total_cost_usd,
        AVG(input_tokens + output_tokens) as avg_tokens
      FROM events
      WHERE created_at >= ${from}
        AND created_at <= ${to}
        AND metadata IS NOT NULL
        AND input_tokens > ${bloatThreshold}
      GROUP BY MD5(metadata::text), SUBSTRING(metadata::text, 1, 100)
    )
    SELECT
      prompt_hash,
      content,
      occurrences,
      total_cost_usd,
      avg_tokens,
      -- Count similar prompts (in production: use pgvector similarity threshold)
      occurrences as similar_count
    FROM prompt_stats
    ORDER BY total_cost_usd DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row: any) => ({
    promptHash: row.prompt_hash,
    content: row.content,
    occurrences: parseInt(row.occurrences),
    totalCostUsd: parseFloat(row.total_cost_usd || '0'),
    avgTokens: parseFloat(row.avg_tokens || '0'),
    similarCount: parseInt(row.similar_count || '0'),
  }));
}

/**
 * TODO: Production implementation with OpenAI embeddings
 *
 * async function generateEmbedding(text: string): Promise<number[]> {
 *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   const response = await openai.embeddings.create({
 *     model: 'text-embedding-3-small',
 *     input: text.slice(0, 8000)
 *   });
 *   return response.data[0].embedding;
 * }
 *
 * Then use pgvector:
 * SELECT * FROM prompt_embeddings
 * WHERE embedding <=> query_embedding < threshold
 * ORDER BY embedding <=> query_embedding
 * LIMIT 10
 */
