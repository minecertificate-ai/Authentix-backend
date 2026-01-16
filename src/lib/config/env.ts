/**
 * ENVIRONMENT CONFIGURATION
 *
 * Validates all required environment variables at startup using Zod.
 * Provides type-safe access to configuration throughout the application.
 */

import { z } from 'zod';

/**
 * Environment validation schema
 */
const envSchema = z.object({
  // Required - Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),

  // Optional with defaults - Server
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('3001'),
  HOST: z.string().default('0.0.0.0'),

  // Optional - Razorpay (Test)
  RAZORPAY_KEY_ID_TEST: z.string().optional(),
  RAZORPAY_KEY_SECRET_TEST: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET_TEST: z.string().optional(),

  // Optional - Razorpay (Production)
  RAZORPAY_KEY_ID_PROD: z.string().optional(),
  RAZORPAY_KEY_SECRET_PROD: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET_PROD: z.string().optional(),

  // Optional - Feature Flags
  CORS_STRICT_MODE: z.string().transform(v => v === 'true').default('true'),
  CSRF_ENFORCEMENT: z.enum(['cookie', 'all', 'off']).default('cookie'),
  RATE_LIMIT_ENABLED: z.string().transform(v => v === 'true').default('true'),
  HELMET_ENABLED: z.string().transform(v => v === 'true').default('true'),

  // Optional - Performance
  JWT_CACHE_ENABLED: z.string().transform(v => v === 'true').default('true'),
  JWT_CACHE_TTL: z.string().transform(Number).pipe(z.number().int().positive()).default('3600'),
  DASHBOARD_CACHE_TTL: z.string().transform(Number).pipe(z.number().int().positive()).default('60'),
  SIGNED_URL_CACHE_ENABLED: z.string().transform(v => v === 'true').default('true'),

  // Optional - Templates
  TEMPLATES_DEFAULT_INCLUDE_PREVIEW: z.string().transform(v => v === 'true').default('false'),

  // Optional - Logging
  SLOW_REQUEST_THRESHOLD: z.string().transform(Number).pipe(z.number().int().positive()).default('500'),
  LOG_REDACTION_ENABLED: z.string().transform(v => v === 'true').default('true'),

  // Optional - Idempotency
  IDEMPOTENCY_ENABLED: z.string().transform(v => v === 'true').default('true'),
  IDEMPOTENCY_TTL: z.string().transform(Number).pipe(z.number().int().positive()).default('86400'),

  // Optional - Pagination
  MAX_PAGE_LIMIT: z.string().transform(Number).pipe(z.number().int().positive()).default('100'),
});

/**
 * Validated and typed configuration object
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws detailed error if validation fails
 */
function validateEnv(): Config {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(err => `  - ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      console.error('❌ Environment validation failed:\n' + missingVars);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated configuration singleton
 * Import this instead of accessing process.env directly
 */
export const config = validateEnv();

/**
 * Helper to determine if running in production
 */
export const isProduction = config.NODE_ENV === 'production';

/**
 * Helper to determine if running in development
 */
export const isDevelopment = config.NODE_ENV === 'development';

/**
 * Helper to determine if running in test
 */
export const isTest = config.NODE_ENV === 'test';
