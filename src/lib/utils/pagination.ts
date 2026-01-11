/**
 * PAGINATION UTILITIES
 *
 * Helper functions for safe pagination.
 * Prevents abuse by enforcing max limits.
 */

import { config } from '../config/env.js';

/**
 * Enforce safe pagination limit
 *
 * @param requestedLimit - Limit requested by client
 * @param defaultLimit - Default if client doesn't specify
 * @returns Safe limit (capped at MAX_PAGE_LIMIT)
 */
export function enforcePaginationLimit(
  requestedLimit?: number,
  defaultLimit: number = 20
): number {
  // Use default if not provided
  if (!requestedLimit) {
    return defaultLimit;
  }

  // Ensure it's a positive number
  if (requestedLimit <= 0) {
    return defaultLimit;
  }

  // Cap at configured maximum
  return Math.min(requestedLimit, config.MAX_PAGE_LIMIT);
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, limit: number): number {
  const safePage = Math.max(1, page); // Minimum page 1
  return (safePage - 1) * limit;
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Validate and sanitize pagination params
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function sanitizePaginationParams(
  page?: number,
  limit?: number,
  defaultLimit: number = 20
): PaginationParams {
  const safeLimit = enforcePaginationLimit(limit, defaultLimit);
  const safePage = Math.max(1, page || 1);
  const offset = calculateOffset(safePage, safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    offset,
  };
}
