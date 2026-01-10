/**
 * RESPONSE UTILITIES
 *
 * Standardized response helpers for consistent API responses.
 */

import type { FastifyReply } from 'fastify';
import type { ApiResponse, PaginatedResponse } from '../types/common.js';

/**
 * Send success response
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      request_id: reply.request.id ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  reply.status(statusCode).send(response);
}

/**
 * Send paginated response
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  data: PaginatedResponse<T>,
  statusCode = 200
): void {
  const response: ApiResponse<PaginatedResponse<T>> = {
    success: true,
    data,
    meta: {
      request_id: reply.request.id ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  reply.status(statusCode).send(response);
}

/**
 * Send error response
 */
export function sendError(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode = 400,
  details?: Record<string, unknown>
): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      request_id: reply.request.id ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  };

  reply.status(statusCode).send(response);
}
