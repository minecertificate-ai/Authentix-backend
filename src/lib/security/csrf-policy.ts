/**
 * CSRF PROTECTION POLICY
 *
 * Smart CSRF enforcement:
 * - Enforced for cookie-based authentication (browser requests)
 * - Skipped for Bearer token authentication (server-to-server, BFF)
 * - Skipped for webhook routes (signature-verified)
 * - Only enforced on state-changing methods (POST, PUT, PATCH, DELETE)
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

/**
 * Determine if CSRF protection should be enforced for this request
 */
export function shouldEnforceCSRF(request: FastifyRequest): boolean {
  // Feature flag check
  if (config.CSRF_ENFORCEMENT === 'off') {
    return false;
  }

  // Only enforce on state-changing methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(request.method)) {
    return false;
  }

  // Skip for webhook routes (they use signature verification)
  if (request.url.startsWith('/api/v1/webhooks/')) {
    return false;
  }

  // If CSRF_ENFORCEMENT is 'all', enforce for all authenticated requests
  if (config.CSRF_ENFORCEMENT === 'all') {
    return true;
  }

  // Default mode: 'cookie' - only enforce for cookie-based auth
  // Check if auth came from cookie (not Bearer token)
  const authSource = (request as any).authSource;
  return authSource === 'cookie';
}

/**
 * Custom CSRF error handler
 */
export async function csrfErrorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (error.message === 'Invalid CSRF token') {
    await reply.status(403).send({
      success: false,
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid or missing CSRF token. Please refresh and try again.',
      },
      meta: {
        request_id: request.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Re-throw other errors
  throw error;
}

/**
 * Extract CSRF token from request
 * Supports both header and body
 */
export function getCSRFToken(request: FastifyRequest): string | undefined {
  // Check header first (preferred)
  const headerToken = request.headers['x-csrf-token'] as string | undefined;
  if (headerToken) {
    return headerToken;
  }

  // Check body (for form submissions)
  const body = request.body as any;
  if (body && body._csrf) {
    return body._csrf;
  }

  return undefined;
}
