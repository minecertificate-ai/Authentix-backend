/**
 * IDEMPOTENCY KEY MIDDLEWARE
 *
 * Implements idempotency for mutation endpoints using in-memory cache.
 * Prevents duplicate operations on network retries.
 *
 * Usage: Apply to POST/PUT endpoints that create resources
 * - POST /certificates/generate
 * - POST /import-jobs
 * - POST /templates (optional)
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { LRUCache } from 'lru-cache';
import { config } from '../config/env.js';

/**
 * Cached idempotency response
 */
interface IdempotencyResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  createdAt: number;
}

/**
 * LRU Cache for idempotency keys
 * - Max 5000 entries
 * - TTL from config (default 24 hours)
 */
const idempotencyCache = new LRUCache<string, IdempotencyResponse>({
  max: 5000,
  ttl: config.IDEMPOTENCY_TTL * 1000, // Convert seconds to milliseconds
});

/**
 * Generate cache key for idempotency
 * Combines company ID + idempotency key for isolation
 */
function generateIdempotencyKey(companyId: string, idempotencyKey: string): string {
  return `idempotency:${companyId}:${idempotencyKey}`;
}

/**
 * Idempotency middleware (preHandler hook)
 * Checks for cached response before executing handler
 */
export async function idempotencyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Feature flag check
  if (!config.IDEMPOTENCY_ENABLED) {
    return;
  }

  // Only apply to mutation methods
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }

  // Get idempotency key from header
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

  // If no key provided, continue normally (idempotency is optional)
  if (!idempotencyKey) {
    return;
  }

  // Get company ID from context (must be authenticated)
  const companyId = (request as any).context?.companyId;
  if (!companyId) {
    // Not authenticated yet, skip (will be caught by auth middleware)
    return;
  }

  // Check cache for existing response
  const cacheKey = generateIdempotencyKey(companyId, idempotencyKey);
  const cached = idempotencyCache.get(cacheKey);

  if (cached) {
    // Return cached response
    request.log.info({
      idempotencyKey,
      companyId,
      cacheHit: true,
    }, 'Idempotency cache hit');

    // Set cached headers
    Object.entries(cached.headers).forEach(([key, value]) => {
      reply.header(key, value);
    });

    // Send cached response
    await reply.status(cached.statusCode).send(cached.body);

    // Mark request as handled (prevent further processing)
    reply.hijack();
  }
}

/**
 * Idempotency middleware (onSend hook)
 * Caches successful responses
 */
export async function idempotencyOnSend(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  done: HookHandlerDoneFunction
): Promise<void> {
  // Feature flag check
  if (!config.IDEMPOTENCY_ENABLED) {
    done();
    return;
  }

  // Only cache mutation methods
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    done();
    return;
  }

  // Get idempotency key
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) {
    done();
    return;
  }

  // Get company ID
  const companyId = (request as any).context?.companyId;
  if (!companyId) {
    done();
    return;
  }

  // Only cache successful responses (2xx)
  if (reply.statusCode < 200 || reply.statusCode >= 300) {
    done();
    return;
  }

  // Cache the response
  const cacheKey = generateIdempotencyKey(companyId, idempotencyKey);

  // Get headers to cache (exclude sensitive ones)
  const headers: Record<string, string> = {};
  const headersToCache = ['content-type', 'x-request-id'];
  headersToCache.forEach(headerName => {
    const value = reply.getHeader(headerName);
    if (value) {
      headers[headerName] = String(value);
    }
  });

  idempotencyCache.set(cacheKey, {
    statusCode: reply.statusCode,
    body: payload,
    headers,
    createdAt: Date.now(),
  });

  request.log.info({
    idempotencyKey,
    companyId,
    statusCode: reply.statusCode,
  }, 'Idempotency response cached');

  done();
}

/**
 * Clear idempotency cache (for testing)
 */
export function clearIdempotencyCache(): void {
  idempotencyCache.clear();
}

/**
 * Get idempotency cache stats
 */
export function getIdempotencyCacheStats() {
  return {
    size: idempotencyCache.size,
    maxSize: 5000,
    ttl: config.IDEMPOTENCY_TTL,
    enabled: config.IDEMPOTENCY_ENABLED,
  };
}
