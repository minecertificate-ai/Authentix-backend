/**
 * CONTEXT MIDDLEWARE
 *
 * Attaches request context to Fastify request.
 * Creates child logger with user/company context for better debugging.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RequestContext } from '../types/common.js';

declare module 'fastify' {
  interface FastifyRequest {
    context?: RequestContext;
  }
}

/**
 * Context middleware
 *
 * Attaches request context (user, company, requestId) to request.
 * Creates child logger with context for better log traceability.
 */
export async function contextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    throw new Error('Auth context required before context middleware');
  }

  // Create request context
  request.context = {
    userId: request.auth.userId,
    organizationId: request.auth.organizationId,
    role: request.auth.role,
    requestId: request.id ?? 'unknown',
  };

  // Create child logger with context
  // All subsequent logs will include userId, organizationId, role
  request.log = request.log.child({
    userId: request.auth.userId,
    organizationId: request.auth.organizationId,
    role: request.auth.role,
  });
}
