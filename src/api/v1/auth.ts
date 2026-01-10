/**
 * AUTH API
 *
 * RESTful API endpoints for authentication.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../../domains/auth/service.js';
import { loginSchema, signupSchema } from '../../domains/auth/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { ValidationError } from '../../lib/errors/handler.js';

/**
 * Register auth routes
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/login
   * Login user
   */
  app.post(
    '/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const dto = loginSchema.parse(request.body);
        const service = new AuthService();

        const result = await service.login(dto);

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
   * Signup user
   */
  app.post(
    '/auth/signup',
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
   */
  app.post(
    '/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          sendError(reply, 'UNAUTHORIZED', 'Missing authorization header', 401);
          return;
        }

        const token = authHeader.substring(7);
        const service = new AuthService();

        await service.logout(token);

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
   */
  app.get(
    '/auth/session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          sendSuccess(reply, { user: null, valid: false });
          return;
        }

        const token = authHeader.substring(7);
        const service = new AuthService();

        const result = await service.verifySession(token);

        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to verify session');
        sendSuccess(reply, { user: null, valid: false });
      }
    }
  );
}
