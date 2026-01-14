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

        const userId = request.context!.userId;
        const profile = await service.getProfile(userId);

        if (!profile) {
          // Profile missing - controlled, non-500 error for dashboard bootstrap flows
          const message = `[Profile Fetch] profile missing for user_id=${userId}`;
          request.log.warn({ userId }, message);

          sendError(
            reply,
            'PROFILE_NOT_READY',
            'User profile not ready. Please retry shortly.',
            409
          );
          return;
        }

        // Contract for dashboard:
        // {
        //   profile,
        //   organization,
        //   role
        // }
        const responseBody = {
          profile: {
            id: profile.id,
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            full_name: profile.full_name,
          },
          organization: profile.organization,
          role: profile.membership?.role_key ?? null,
        };

        sendSuccess(reply, responseBody);
      } catch (error) {
        request.log.error(error, 'Failed to get user profile');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to get user profile', 500);
      }
    }
  );
}
