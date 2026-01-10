/**
 * HELMET SECURITY HEADERS CONFIGURATION
 *
 * Configures security headers using @fastify/helmet.
 * - HSTS in production only (avoids localhost issues)
 * - CSP minimal (frontend owns CSP policy)
 * - Standard security headers enabled
 */

import type { FastifyHelmetOptions } from '@fastify/helmet';
import { config, isProduction } from '../config/env.js';

/**
 * Helmet configuration
 */
export function getHelmetConfig(): FastifyHelmetOptions | false {
  // Allow disabling helmet via feature flag
  if (!config.HELMET_ENABLED) {
    return false;
  }

  return {
    // Enable HSTS only in production (avoid localhost issues)
    hsts: isProduction ? {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    } : false,

    // Disable CSP at backend (frontend handles CSP)
    contentSecurityPolicy: false,

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // X-Content-Type-Options: nosniff
    noSniff: true,

    // X-Frame-Options: DENY (prevent clickjacking)
    frameguard: {
      action: 'deny',
    },

    // X-XSS-Protection (legacy, but doesn't hurt)
    xssFilter: true,

    // Referrer-Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options (IE-specific)
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },
  };
}
