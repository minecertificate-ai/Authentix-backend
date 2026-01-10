/**
 * SLOW REQUEST LOGGING HOOK
 *
 * Fastify onResponse hook to log slow requests.
 * Only logs requests exceeding the threshold to avoid log noise.
 *
 * Provides observability for performance issues without overwhelming logs.
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { config } from '../config/env.js';

/**
 * Slow request logging hook
 * Logs requests that exceed the configured threshold
 */
export function slowRequestHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Get response time from Fastify (available after response is sent)
  const duration = reply.elapsedTime;

  // Only log if exceeds threshold
  if (duration > config.SLOW_REQUEST_THRESHOLD) {
    request.log.info({
      type: 'slow_request',
      method: request.method,
      url: request.url,
      duration,
      statusCode: reply.statusCode,
      userId: (request as any).context?.userId,
      companyId: (request as any).context?.companyId,
    }, `Slow request: ${request.method} ${request.url} (${Math.round(duration)}ms)`);
  }

  done();
}

/**
 * Get formatted response time for logging
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
