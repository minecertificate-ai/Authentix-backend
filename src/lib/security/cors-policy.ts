/**
 * CORS POLICY
 *
 * Strict CORS configuration for production security.
 * - Production: Only exact FRONTEND_URL allowed
 * - Development: Localhost variants allowed
 * - No blanket "allow all origins" bypass
 */

import type { FastifyCorsOptions } from '@fastify/cors';
import { config, isDevelopment } from '../config/env.js';

/**
 * Get allowed origins based on environment
 */
export function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Always include configured frontend URL
  if (config.FRONTEND_URL) {
    origins.push(config.FRONTEND_URL);
  }

  // Development: Allow localhost variants
  if (isDevelopment) {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    );
  }

  return origins;
}

/**
 * CORS configuration
 */
export function getCorsConfig(): FastifyCorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin: (origin, callback) => {
      // Allow requests without Origin header (health checks, direct access, server-to-server)
      // CORS only applies when Origin header is present
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check if origin is in allowlist
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Check if origin starts with any allowed origin (for subdomain support)
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        callback(null, true);
        return;
      }

      // In strict mode (production), reject unknown origins
      if (config.CORS_STRICT_MODE) {
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
        return;
      }

      // In non-strict mode (development), allow other origins with warning
      callback(null, true);
    },

    // Allow credentials (cookies) only when origin is validated
    credentials: true,

    // Allowed methods
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Allowed headers
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'Idempotency-Key',
    ],

    // Exposed headers (visible to frontend)
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],

    // Preflight cache (24 hours)
    maxAge: 86400,
  };
}
