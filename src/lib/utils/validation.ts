/**
 * VALIDATION UTILITIES
 *
 * Common validation schemas and helpers.
 */

import { z } from 'zod';

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid();

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc').optional(),
});

/**
 * Extract pagination params from query
 */
export function parsePagination(query: unknown) {
  return paginationSchema.parse(query);
}

/**
 * Date range schema
 */
export const dateRangeSchema = z.object({
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});
