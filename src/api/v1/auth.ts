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
          sendSuccess(reply, { user: null, valid: false });
          return;
        }

        const service = new AuthService();
        const result = await service.verifySession(token);

        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to verify session');
        sendSuccess(reply, { user: null, valid: false });
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
   * Requires valid JWT (but NOT organization membership - that's what we're creating)
   */
  app.post(
    '/auth/bootstrap',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        // Use JWT-only auth (no membership required, since we're creating it)
        const { jwtOnlyAuthMiddleware } = await import('../../lib/auth/middleware.js');
        await jwtOnlyAuthMiddleware(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!request.auth?.userId) {
          sendError(reply, 'UNAUTHORIZED', 'Missing authorization', 401);
          return;
        }

        const userId = request.auth.userId;
        request.log.info({ userId }, 'Bootstrap request received');

        const service = new AuthService();
        const result = await service.bootstrap(userId);

        request.log.info({
          userId,
          organizationId: result.organization?.id,
          membershipId: result.membership?.id,
        }, 'Bootstrap completed successfully');

        sendSuccess(reply, result, 201);
      } catch (error) {
        if (error instanceof ValidationError) {
          request.log.warn({ userId: request.auth?.userId, error: error.message }, 'Bootstrap validation error');
          sendError(reply, 'VALIDATION_ERROR', error.message, 400);
        } else {
          const message = error instanceof Error ? error.message : 'Failed to bootstrap user';
          request.log.error({ userId: request.auth?.userId, error: message }, 'Failed to bootstrap user');
          sendError(reply, 'INTERNAL_ERROR', message, 500);
        }
      }
    }
  );
}
