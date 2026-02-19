import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  formatPaginatedResponse,
  parseLimit,
} from '../utils/pagination.js';

describe('Pagination utilities', () => {
  describe('encodeCursor/decodeCursor', () => {
    it('should encode and decode cursor roundtrip', () => {
      const cursor = { timestamp: 1708345200000, id: 'event-123' };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded.timestamp).toBe(cursor.timestamp);
      expect(decoded.id).toBe(cursor.id);
    });

    it('should throw error for invalid cursor format', () => {
      expect(() => decodeCursor('invalid-base64!!!')).toThrow('Invalid cursor format');
    });

    it('should throw error for malformed JSON in cursor', () => {
      const invalidBase64 = Buffer.from('not-json').toString('base64');
      expect(() => decodeCursor(invalidBase64)).toThrow('Invalid cursor format');
    });

    it('should handle cursors with special characters in id', () => {
      const cursor = { timestamp: Date.now(), id: 'evt-abc-123_xyz' };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded.id).toBe(cursor.id);
    });
  });

  describe('formatPaginatedResponse', () => {
    it('should return hasMore=true when data.length > limit', () => {
      const data = [
        { id: '1', createdAt: new Date('2024-01-01') },
        { id: '2', createdAt: new Date('2024-01-02') },
        { id: '3', createdAt: new Date('2024-01-03') },
      ];
      const result = formatPaginatedResponse(data, 2);

      expect(result.pagination.hasMore).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.pagination.nextCursor).toBeTruthy();
    });

    it('should return hasMore=false when data.length <= limit', () => {
      const data = [
        { id: '1', createdAt: new Date('2024-01-01') },
        { id: '2', createdAt: new Date('2024-01-02') },
      ];
      const result = formatPaginatedResponse(data, 5);

      expect(result.pagination.hasMore).toBe(false);
      expect(result.data.length).toBe(2);
      expect(result.pagination.nextCursor).toBeNull();
    });

    it('should return hasMore=false when data.length equals limit', () => {
      const data = [
        { id: '1', createdAt: new Date('2024-01-01') },
        { id: '2', createdAt: new Date('2024-01-02') },
      ];
      const result = formatPaginatedResponse(data, 2);

      expect(result.pagination.hasMore).toBe(false);
      expect(result.data.length).toBe(2);
    });

    it('should generate nextCursor from last item when hasMore=true', () => {
      const secondDate = new Date('2024-01-02');
      const data = [
        { id: '1', createdAt: new Date('2024-01-01') },
        { id: '2', createdAt: secondDate },
        { id: '3', createdAt: new Date('2024-01-03') },
      ];
      const result = formatPaginatedResponse(data, 2);

      const decoded = decodeCursor(result.pagination.nextCursor!);
      expect(decoded.timestamp).toBe(secondDate.getTime());
      expect(decoded.id).toBe('2'); // Second item (index 1) is the last in returned data
    });

    it('should handle empty data', () => {
      const result = formatPaginatedResponse([], 10);

      expect(result.pagination.hasMore).toBe(false);
      expect(result.data.length).toBe(0);
      expect(result.pagination.nextCursor).toBeNull();
    });
  });

  describe('parseLimit', () => {
    it('should return default limit when limit is undefined', () => {
      expect(parseLimit(undefined)).toBe(50);
    });

    it('should return custom default limit when provided', () => {
      expect(parseLimit(undefined, 100)).toBe(100);
    });

    it('should parse valid limit string', () => {
      expect(parseLimit('25')).toBe(25);
      expect(parseLimit('100')).toBe(100);
    });

    it('should return default limit for invalid values', () => {
      expect(parseLimit('abc')).toBe(50);
      expect(parseLimit('0')).toBe(50);
      expect(parseLimit('-10')).toBe(50);
    });

    it('should cap limit at maxLimit', () => {
      expect(parseLimit('500', 50, 200)).toBe(200);
      expect(parseLimit('1000', 50, 200)).toBe(200);
    });

    it('should allow limit up to maxLimit', () => {
      expect(parseLimit('200', 50, 200)).toBe(200);
      expect(parseLimit('199', 50, 200)).toBe(199);
    });

    it('should handle decimal values by truncating', () => {
      expect(parseLimit('25.7')).toBe(25);
    });
  });
});
