/**
 * AUTH MIDDLEWARE
 *
 * Fastify middleware to verify JWT and attach auth context.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT, extractTokenFromHeader, UnauthorizedError } from './jwt-verifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      companyId: string;
      role: string;
    };
  }
}

export type AuthenticatedRequest = FastifyRequest;

/**
 * Auth middleware
 *
 * Verifies JWT token and attaches auth context to request.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new UnauthorizedError('Missing authorization token');
  }

  try {
    const context = await verifyJWT(token);
    request.auth = context;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * Optional auth middleware
 *
 * Attaches auth context if token is present, but doesn't require it.
 * Useful for public endpoints that have optional auth.
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return; // No token, continue without auth
  }

  try {
    const context = await verifyJWT(token);
    request.auth = context;
  } catch (error) {
    // Ignore auth errors for optional auth
    console.warn('Optional auth failed:', error);
  }
}
