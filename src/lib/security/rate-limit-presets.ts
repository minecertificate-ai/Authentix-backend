/**
 * RATE LIMIT PRESETS
 *
 * Predefined rate limiting configurations for different route types.
 * Uses in-memory LRU cache (no Redis needed for serverless).
 */

import type { RateLimitPluginOptions } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import { config } from '../config/env.js';

/**
 * Global rate limit configuration
 * Applied to all routes unless overridden
 */
export const globalRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000, // LRU cache size
  allowList: (req: FastifyRequest) => {
    // Skip rate limiting for health check
    return req.url === '/health';
  },
  keyGenerator: (req: FastifyRequest) => {
    // Use IP address as default key
    return req.ip;
  },
  errorResponseBuilder: (_req: FastifyRequest, context: any) => {
    return {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.',
        retryAfter: context.after,
      },
      meta: {
        request_id: _req.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
  },
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
};

/**
 * Strict rate limit for authentication endpoints
 * Prevents brute force attacks
 */
export const authRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 5,
  timeWindow: '15 minutes',
  cache: 5000,
  keyGenerator: (req: FastifyRequest) => {
    // Use IP address for public auth routes
    return req.ip;
  },
  errorResponseBuilder: (_req: FastifyRequest, context: any) => {
    return {
      success: false,
      error: {
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        message: 'Too many login attempts. Please try again in 15 minutes.',
        retryAfter: context.after,
      },
      meta: {
        request_id: _req.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
  },
};

/**
 * Moderate rate limit for signup
 * Prevents spam account creation
 */
export const signupRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 3,
  timeWindow: '1 hour',
  cache: 5000,
  keyGenerator: (req: FastifyRequest) => {
    // Use IP address
    return req.ip;
  },
  errorResponseBuilder: (_req: FastifyRequest, context: any) => {
    return {
      success: false,
      error: {
        code: 'TOO_MANY_SIGNUP_ATTEMPTS',
        message: 'Too many signup attempts. Please try again later.',
        retryAfter: context.after,
      },
      meta: {
        request_id: _req.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
  },
};

/**
 * Rate limit for file uploads
 * Prevents resource exhaustion
 */
export const uploadRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 10,
  timeWindow: '1 hour',
  cache: 5000,
  keyGenerator: (req: FastifyRequest) => {
    // Use userId for authenticated upload requests
    const userId = (req as any).context?.userId;
    return userId ? `upload:${userId}` : `upload:${req.ip}`;
  },
  errorResponseBuilder: (_req: FastifyRequest, context: any) => {
    return {
      success: false,
      error: {
        code: 'TOO_MANY_UPLOADS',
        message: 'Upload limit reached. Please try again later.',
        retryAfter: context.after,
      },
      meta: {
        request_id: _req.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
  },
};

/**
 * Rate limit for expensive operations (certificate generation)
 */
export const expensiveOperationRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 20,
  timeWindow: '1 hour',
  cache: 5000,
  keyGenerator: (req: FastifyRequest) => {
    const userId = (req as any).context?.userId;
    return userId ? `expensive:${userId}` : `expensive:${req.ip}`;
  },
  errorResponseBuilder: (_req: FastifyRequest, context: any) => {
    return {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Operation limit reached. Please try again later.',
        retryAfter: context.after,
      },
      meta: {
        request_id: _req.id ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };
  },
};

/**
 * Authenticated route rate limit
 * More generous than public endpoints
 */
export const authenticatedRateLimitConfig: Partial<RateLimitPluginOptions> = {
  max: 60,
  timeWindow: '1 minute',
  cache: 10000,
  keyGenerator: (req: FastifyRequest) => {
    const userId = (req as any).context?.userId;
    // Combine userId + IP for better isolation
    return userId ? `auth:${userId}:${req.ip}` : req.ip;
  },
};

/**
 * Helper to check if rate limiting is enabled
 */
export function isRateLimitEnabled(): boolean {
  return config.RATE_LIMIT_ENABLED;
}

/**
 * Get rate limit config for specific route pattern
 */
export function getRateLimitForRoute(routePath: string): Partial<RateLimitPluginOptions> | null {
  if (!isRateLimitEnabled()) {
    return null;
  }

  // Auth routes
  if (routePath.includes('/auth/login')) {
    return authRateLimitConfig;
  }
  if (routePath.includes('/auth/signup')) {
    return signupRateLimitConfig;
  }

  // Upload routes
  if (routePath.includes('/templates') && routePath.includes('POST')) {
    return uploadRateLimitConfig;
  }
  if (routePath.includes('/import-jobs') && routePath.includes('POST')) {
    return uploadRateLimitConfig;
  }

  // Expensive operations
  if (routePath.includes('/certificates/generate')) {
    return expensiveOperationRateLimitConfig;
  }

  // Default authenticated routes
  return authenticatedRateLimitConfig;
}
