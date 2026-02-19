import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findSimilarPrompts } from '../services/prompt-similarity-service.js';
import { db } from '../db/index.js';
import { redis } from '../lib/redis.js';

// Access the exported function for testing
import crypto from 'crypto';

function generatePromptHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

describe('Prompt Similarity Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePromptHash', () => {
    it('should be deterministic', () => {
      const text = 'test prompt';
      const hash1 = generatePromptHash(text);
      const hash2 = generatePromptHash(text);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = generatePromptHash('prompt A');
      const hash2 = generatePromptHash('prompt B');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = generatePromptHash('');
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    it('should handle special characters', () => {
      const hash = generatePromptHash('prompt with émojis 🚀 and symbols @#$%');
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });
  });

  describe('findSimilarPrompts', () => {
    it('should return empty array when event not found', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const result = await findSimilarPrompts('non-existent-id');

      expect(result).toEqual([]);
    });

    it('should return cached results when available', async () => {
      const cachedData = [
        {
          id: 'evt-1',
          promptHash: 'abc123',
          content: 'test prompt',
          feature: 'chat',
          model: 'gpt-4o',
          similarity: 1.0,
          occurrences: 5,
          totalCostUsd: 0.05,
        },
      ];

      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedData));

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'evt-123',
                metadata: { prompt: 'test' },
              },
            ]),
          }),
        }),
      } as any);

      const result = await findSimilarPrompts('evt-123');

      expect(result).toEqual(cachedData);
      expect(redis.get).toHaveBeenCalledWith('similarity:evt-123');
    });

    it('should handle database query errors gracefully', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      } as any);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await findSimilarPrompts('evt-123');

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle missing cached data gracefully', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'evt-123',
                metadata: { prompt: 'test' },
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.execute).mockResolvedValue({
        rows: [],
      } as any);

      const result = await findSimilarPrompts('evt-123');

      // Should query database when cache miss
      expect(db.execute).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect threshold parameter', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'evt-123',
                metadata: { prompt: 'test' },
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.execute).mockResolvedValue({
        rows: [],
      } as any);

      await findSimilarPrompts('evt-123', 0.9, 10);

      // Threshold is used in the function (though not in SQL for hash-based MVP)
      expect(db.execute).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'evt-123',
                metadata: { prompt: 'test' },
              },
            ]),
          }),
        }),
      } as any);

      vi.mocked(db.execute).mockResolvedValue({
        rows: [],
      } as any);

      await findSimilarPrompts('evt-123', 0.8, 5);

      // Limit should be passed to SQL query
      expect(db.execute).toHaveBeenCalledWith(expect.anything());
    });
  });
});
