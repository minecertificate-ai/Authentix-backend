/**
 * CONTEXT MIDDLEWARE
 *
 * Attaches request context to Fastify request.
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
 */
export async function contextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    throw new Error('Auth context required before context middleware');
  }

  request.context = {
    userId: request.auth.userId,
    companyId: request.auth.companyId,
    role: request.auth.role,
    requestId: request.id ?? 'unknown',
  };
}
