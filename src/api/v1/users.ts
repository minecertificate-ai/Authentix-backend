/**
 * USERS API
 *
 * RESTful API endpoints for user profile management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { UserRepository } from '../../domains/users/repository.js';
import { UserService } from '../../domains/users/service.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError } from '../../lib/errors/handler.js';

/**
 * Register user routes
 */
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/users/me
   * Get current user's profile
   */
  app.get(
    '/users/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new UserRepository(getSupabaseClient());
        const service = new UserService(repository);

        const profile = await service.getProfile(request.context!.userId);

        sendSuccess(reply, profile);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get user profile');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get user profile', 500);
        }
      }
    }
  );
}
