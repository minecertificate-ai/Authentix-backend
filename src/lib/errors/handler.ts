/**
 * ERROR HANDLER
 *
 * Standardized error handling for Fastify.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../auth/jwt-verifier.js';

export class ValidationError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Helper to log PostgREST schema mismatches (stale schema cache / missing columns)
 *
 * Usage:
 *   if (error && (error as any).code === 'PGRST204') {
 *     logSchemaMismatch(request.log, {
 *       endpoint: request.url,
 *       method: 'UserRepository.getProfile',
 *       table: 'profiles',
 *       column: '...'
 *     }, error);
 *   }
 */
export function logSchemaMismatch(
  logger: { warn: (obj: Record<string, unknown>, msg?: string) => void },
  context: {
    endpoint: string;
    method: string;
    table?: string;
    column?: string;
  },
  error: unknown
): void {
  const err = error as any;
  const code = err?.code;

  logger.warn(
    {
      ...context,
      code,
      message: err?.message,
      details: err?.details,
      hint: err?.hint,
      reminder: "If this is a PostgREST schema-cache error (PGRST204), run: NOTIFY pgrst, 'reload schema';",
    },
    '[Schema Mismatch] Potential PostgREST schema-cache mismatch detected'
  );
}

/**
 * Error handler middleware
 */
export async function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id ?? 'unknown';

  // Log error
  request.log.error({
    err: error,
    requestId,
    path: request.url,
    method: request.method,
  }, `[Error] ${error.name}: ${error.message}`);

  // Handle known errors
  if (error instanceof UnauthorizedError) {
    // Minimal logging for 401 errors (no stack spam)
    request.log.info({
      requestId,
      path: request.url,
      method: request.method,
      message: error.message,
    }, `[401] Unauthorized: ${error.message}`);
    
    await reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: error.message || 'Authentication required',
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (error instanceof ValidationError) {
    await reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (error instanceof NotFoundError) {
    await reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (error instanceof ForbiddenError) {
    await reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: error.message,
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (error instanceof ConflictError) {
    await reply.status(409).send({
      success: false,
      error: {
        code: 'CONFLICT',
        message: error.message,
      },
      meta: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Generic internal error
  await reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
