import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Validate date range: from < to, valid ISO format
 */
export function validateDateRange(from: string, to: string): { valid: boolean; error?: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime())) return { valid: false, error: 'Invalid "from" date format' };
  if (isNaN(toDate.getTime())) return { valid: false, error: 'Invalid "to" date format' };
  if (fromDate >= toDate) return { valid: false, error: '"from" must be before "to"' };

  return { valid: true };
}

/**
 * Validate request body against Zod schema
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.query = result.data;
    next();
  };
}
