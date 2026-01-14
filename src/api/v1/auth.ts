/**
 * AUTH API
 *
 * RESTful API endpoints for authentication.
 * Supports both Bearer token and HttpOnly cookie authentication.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../../domains/auth/service.js';
import { loginSchema, signupSchema } from '../../domains/auth/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { ValidationError } from '../../lib/errors/handler.js';
import { setAuthCookies, clearAuthCookies, getTokenFromCookies } from '../../lib/security/cookie-config.js';
import { authRateLimitConfig, signupRateLimitConfig } from '../../lib/security/rate-limit-presets.js';
import { config } from '../../lib/config/env.js';

/**
 * Register auth routes
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Add custom content type parser for auth routes to allow empty JSON bodies
  // (needed for bootstrap endpoint which doesn't require a body)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      // Allow empty body - return empty object if body is empty or whitespace
      if (!body || body.trim() === '') {
        done(null, {});
      } else {
        done(null, JSON.parse(body));
      }
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  /**
   * POST /api/v1/auth/login
   * Login user
   * Sets HttpOnly cookies and returns tokens in body (backward compatible)
   */
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: config.RATE_LIMIT_ENABLED ? authRateLimitConfig : false,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const dto = loginSchema.parse(request.body);
        const service = new AuthService();

        const result = await service.login(dto);

        // Set HttpOnly cookies (NEW - for BFF pattern)
        setAuthCookies(
          reply,
          result.session.access_token,
          result.session.refresh_token,
          result.session.expires_at
        );

        // Also return tokens in body for backward compatibility
        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to login');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to login', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/auth/signup
   * Signup user - sends verification email WITHOUT granting session
   */
  app.post(
    '/auth/signup',
    {
      config: {
        rateLimit: config.RATE_LIMIT_ENABLED ? signupRateLimitConfig : false,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const dto = signupSchema.parse(request.body);
        const service = new AuthService();

        const result = await service.signup(dto);

        sendSuccess(reply, result, 201);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to signup');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to signup', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/auth/logout
   * Logout user
   * Supports both Bearer token and cookies
   */
  app.post(
    '/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to get token from either source
        const authHeader = request.headers.authorization;
        const cookies = request.cookies as Record<string, string>;
        const cookieToken = getTokenFromCookies(cookies);

        let token: string | undefined;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else if (cookieToken) {
          token = cookieToken;
        }

        if (!token) {
          sendError(reply, 'UNAUTHORIZED', 'Missing authorization', 401);
          return;
        }

        const service = new AuthService();
        await service.logout(token);

        // Clear cookies (if present)
        clearAuthCookies(reply);

        sendSuccess(reply, { message: 'Logged out successfully' });
      } catch (error) {
        request.log.error(error, 'Failed to logout');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to logout', 500);
      }
    }
  );

  /**
   * GET /api/v1/auth/session
   * Verify session and get user info
   * Supports both Bearer token and cookies
   */
  app.get(
    '/auth/session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to get token from either source
        const authHeader = request.headers.authorization;
        const cookies = request.cookies as Record<string, string>;
        const cookieToken = getTokenFromCookies(cookies);

        let token: string | undefined;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else if (cookieToken) {
          token = cookieToken;
        }

        if (!token) {
          sendSuccess(reply, { user: null, valid: false, email_verified: false });
          return;
        }

        const service = new AuthService();
        const result = await service.verifySession(token);

        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to verify session');
        sendSuccess(reply, { user: null, valid: false, email_verified: false });
      }
    }
  );

  /**
   * GET /api/v1/auth/me
   * Get current user info including email verification status
   * Supports both Bearer token and cookies
   * Also supports checking by email (for cross-device polling) if no session exists
   */
  app.get(
    '/auth/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to get token from either source
        const authHeader = request.headers.authorization;
        const cookies = request.cookies as Record<string, string>;
        const cookieToken = getTokenFromCookies(cookies);

        let token: string | undefined;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else if (cookieToken) {
          token = cookieToken;
        }

        const service = new AuthService();
        
        // If token exists, verify session and get full user info
        if (token) {
          const result = await service.verifySession(token);
          sendSuccess(reply, {
            ...result,
            email_verified: result.valid && result.user ? true : false,
          });
          return;
        }

        // If no token, check if email is provided for cross-device verification check
        // This allows frontend polling to check verification status without requiring session cookies
        const email = (request.query as { email?: string })?.email;
        if (email) {
          const { getSupabaseClient } = await import('../../lib/supabase/client.js');
          const supabase = getSupabaseClient();
          
          // Check verification status by email (for cross-device polling)
          // Uses SERVICE ROLE to query auth.users via Admin API
          // Does NOT require cookies or Authorization header
          try {
            // Note: Supabase Admin API doesn't have direct getUserByEmail method
            // We use listUsers() and filter by email (acceptable for verification checks)
            const { data: { users }, error } = await supabase.auth.admin.listUsers();
            
            if (error) {
              request.log.error(error, 'Failed to check verification status by email');
              // Return success with valid=false (not 500) if user not found or error
              sendSuccess(reply, { user: null, valid: false, email_verified: false });
              return;
            }

            const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (!user) {
              // User not found - return success with valid=false (not 500)
              sendSuccess(reply, { user: null, valid: false, email_verified: false });
              return;
            }

            // Check email_confirmed_at to determine verification status
            const emailVerified = !!user.email_confirmed_at;

            sendSuccess(reply, {
              user: {
                id: user.id,
                email: user.email || '',
                full_name: (user.user_metadata?.full_name as string) || null,
              },
              valid: emailVerified,
              email_verified: emailVerified,
            });
            return;
          } catch (error) {
            request.log.error(error, 'Failed to check verification status by email');
            // Return success with valid=false (not 500) on error
            sendSuccess(reply, { user: null, valid: false, email_verified: false });
            return;
          }
        }

        // No token and no email provided
        sendSuccess(reply, { user: null, valid: false, email_verified: false });
      } catch (error) {
        request.log.error(error, 'Failed to get user info');
        sendSuccess(reply, { user: null, valid: false, email_verified: false });
      }
    }
  );

  /**
   * GET /api/v1/auth/verification-status?email={email}
   * Check email verification status (for frontend polling, no session required)
   * Returns { verified: boolean }
   */
  app.get(
    '/auth/verification-status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const email = (request.query as { email?: string })?.email;
        
        if (!email) {
          sendError(reply, 'VALIDATION_ERROR', 'Email parameter is required', 400);
          return;
        }

        // Use SERVICE ROLE to query auth.users (no session required)
        const { getSupabaseClient } = await import('../../lib/supabase/client.js');
        const supabase = getSupabaseClient();
        
        try {
          // Use Admin API to find user by email
          const { data: { users }, error } = await supabase.auth.admin.listUsers();
          
          if (error) {
            request.log.error(error, 'Failed to check verification status');
            sendSuccess(reply, { verified: false });
            return;
          }

          const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (!user) {
            // User not found - return verified: false (not 500)
            sendSuccess(reply, { verified: false });
            return;
          }

          // Check email_confirmed_at to determine verification status
          const verified = !!user.email_confirmed_at;

          sendSuccess(reply, { verified });
        } catch (error) {
          request.log.error(error, 'Failed to check verification status by email');
          sendSuccess(reply, { verified: false });
        }
      } catch (error) {
        request.log.error(error, 'Failed to get verification status');
        sendSuccess(reply, { verified: false });
      }
    }
  );

  /**
   * GET /api/v1/auth/csrf-token
   * Get CSRF token for cookie-based auth
   * NEW ENDPOINT
   */
  app.get(
    '/auth/csrf-token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Generate CSRF token
        const csrfToken = await reply.generateCsrf();

        sendSuccess(reply, {
          csrf_token: csrfToken,
        });
      } catch (error) {
        request.log.error(error, 'Failed to generate CSRF token');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to generate CSRF token', 500);
      }
    }
  );

  /**
   * POST /api/v1/auth/resend-verification
   * Resend verification email
   */
  app.post(
    '/auth/resend-verification',
    {
      config: {
        rateLimit: config.RATE_LIMIT_ENABLED ? authRateLimitConfig : false,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { email: string };

        if (!body.email) {
          sendError(reply, 'VALIDATION_ERROR', 'Email is required', 400);
          return;
        }

        const service = new AuthService();
        const result = await service.resendVerificationEmail(body.email);

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400);
        } else {
          request.log.error(error, 'Failed to resend verification email');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to resend verification email', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/auth/bootstrap
   * Bootstrap user after email verification
   * Creates organization, membership, and trial (idempotent)
   * 
   * Security:
   * - REQUIRES valid JWT/cookie authentication (no anonymous bootstrap)
   * - Does NOT require organization membership (that's what we're creating)
   * - Returns 401 with clear message if no auth token present
   * 
   * Note: This endpoint doesn't require a request body (empty JSON body is allowed)
   */
  app.post(
    '/auth/bootstrap',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        // Use JWT-only auth (no membership required, since we're creating it)
        // This middleware will throw UnauthorizedError if no token is present
        // The error handler will convert it to a proper 401 JSON response
        const { jwtOnlyAuthMiddleware } = await import('../../lib/auth/middleware.js');
        await jwtOnlyAuthMiddleware(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // At this point, auth is guaranteed (middleware throws if missing)
      // Double-check for safety, but this should never be null after middleware
      if (!request.auth?.userId) {
        // This should never happen if middleware works correctly, but fail-safe
        request.log.warn({ 
          path: request.url,
          hasAuth: !!request.auth,
        }, '[Bootstrap] Auth check failed after middleware (unexpected)');
        sendError(reply, 'UNAUTHORIZED', 'Authentication required', 401);
        return;
      }

      const userId = request.auth.userId;
      
      try {
        request.log.info({ userId }, '[Bootstrap] Request received');

        const service = new AuthService();
        const result = await service.bootstrap(userId);

        request.log.info({
          userId,
          organizationId: result.organization?.id,
          membershipId: result.membership?.id,
        }, '[Bootstrap] Completed successfully');

        sendSuccess(reply, result, 201);
      } catch (error) {
        // Handle validation errors (400)
        if (error instanceof ValidationError) {
          request.log.warn({ 
            userId, 
            step: 'validation',
            error: error.message 
          }, '[Bootstrap] Validation error');
          sendError(reply, 'VALIDATION_ERROR', error.message, 400);
          return;
        }

        // Handle actual bootstrap failures (500 with step info)
        const message = error instanceof Error ? error.message : 'Failed to bootstrap user';
        
        // Extract step from error message if present
        const stepMatch = message.match(/\[Bootstrap Step: ([^\]]+)\]/);
        const step = stepMatch ? stepMatch[1] : 'unknown';
        
        // Log with step and PostgREST error details (for actual failures, not 401s)
        request.log.error({ 
          userId, 
          step,
          error_message: message,
          // Only include stack for non-401 errors (401s are logged minimally in error handler)
          stack: error instanceof Error ? error.stack : undefined
        }, `[Bootstrap] Failed at step: ${step}`);
        
        // Return structured error for bootstrap failures with step information
        sendError(reply, 'bootstrap_failed', message, 500, {
          step,
          details: message,
        });
      }
    }
  );
}
