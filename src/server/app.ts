/**
 * FASTIFY APPLICATION BUILDER
 *
 * Main Fastify instance creation with all plugins, middleware, and routes.
 * Separated from index.ts for better testability and modularity.
 */

import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { config } from '../lib/config/env.js';
import { getRedactionConfig } from '../lib/logging/redaction.js';
import { slowRequestHook } from '../lib/logging/slow-request-hook.js';
import { errorHandler } from '../lib/errors/handler.js';
import { getCorsConfig } from '../lib/security/cors-policy.js';
import { getHelmetConfig } from '../lib/security/helmet-config.js';
import { globalRateLimitConfig, isRateLimitEnabled } from '../lib/security/rate-limit-presets.js';
import { COOKIE_NAMES } from '../lib/security/cookie-config.js';

/**
 * Build Fastify application instance
 */
export async function buildApp() {
  // Create Fastify instance with logging
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
      redact: getRedactionConfig(),
    },
    requestIdLogLabel: 'requestId',
    genReqId: () => randomUUID(),
    // Trust proxy headers (for accurate IP addresses behind reverse proxy)
    trustProxy: true,
  });

  // ========================================
  // PLUGIN REGISTRATION (Order matters!)
  // ========================================

  // 1. CORS (before any route handling)
  await app.register(import('@fastify/cors'), getCorsConfig());

  // 2. Cookie parser (needed for cookie auth and CSRF)
  await app.register(import('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET, // Optional: for signing cookies
    parseOptions: {}, // Default options
  });

  // 3. Helmet - Security headers
  const helmetConfig = getHelmetConfig();
  if (helmetConfig !== false) {
    await app.register(import('@fastify/helmet'), helmetConfig);
  }

  // 4. Rate limiting (global)
  if (isRateLimitEnabled()) {
    await app.register(import('@fastify/rate-limit'), globalRateLimitConfig);
  }

  // 5. Multipart for file uploads (scoped, not global)
  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // 6. CSRF Protection
  // Will be conditionally applied in routes based on auth method
  await app.register(import('@fastify/csrf-protection'), {
    cookieKey: COOKIE_NAMES.CSRF_TOKEN,
    cookieOpts: {
      httpOnly: false, // Frontend needs to read this
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });

  // ========================================
  // GLOBAL HOOKS
  // ========================================

  // Slow request logging
  app.addHook('onResponse', slowRequestHook);

  // ========================================
  // ERROR HANDLER
  // ========================================

  app.setErrorHandler(errorHandler);

  // ========================================
  // HEALTH & ROOT ROUTES
  // ========================================

  // Root route
  app.get('/', async (_request, reply) => {
    reply.type('application/json');
    return {
      service: 'Authentix Backend API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        api: '/api/v1',
      },
      message: 'Welcome to Authentix Backend API. Use /api/v1 for API endpoints.',
    };
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // ========================================
  // API ROUTES
  // ========================================

  // Register API v1 routes
  await app.register(async function (app) {
    const { registerV1Routes } = await import('../api/v1/index.js');
    await registerV1Routes(app);
  }, { prefix: '/api/v1' });

  return app;
}
