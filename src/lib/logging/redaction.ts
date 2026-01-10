/**
 * LOGGING REDACTION CONFIGURATION
 *
 * Redacts sensitive data from logs to prevent exposure of:
 * - Authentication tokens
 * - Passwords
 * - API keys
 * - Cookie values
 * - PII (configurable)
 *
 * Uses Pino's built-in redaction feature.
 */

import type { LoggerOptions } from 'pino';
import { config } from '../config/env.js';

/**
 * Paths to redact from logs
 * Uses Pino's path syntax (supports nested paths and wildcards)
 */
export const REDACTION_PATHS = [
  // Request headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers.x-api-key',

  // Request body
  'req.body.password',
  'req.body.api_key',
  'req.body.token',
  'req.body.access_token',
  'req.body.refresh_token',

  // Response headers
  'res.headers["set-cookie"]',
  'res.headers.authorization',

  // Any field named 'token' or 'password' at any level
  '*.token',
  '*.password',
  '*.api_key',
  '*.access_token',
  '*.refresh_token',
];

/**
 * Get redaction configuration for Pino logger
 */
export function getRedactionConfig(): LoggerOptions['redact'] {
  if (!config.LOG_REDACTION_ENABLED) {
    return undefined;
  }

  return {
    paths: REDACTION_PATHS,
    censor: '[REDACTED]',
    remove: false, // Keep the keys, just replace values
  };
}
