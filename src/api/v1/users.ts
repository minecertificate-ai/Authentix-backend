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
      const userId = request.context!.userId;
      
      try {
        const repository = new UserRepository(getSupabaseClient());
        const service = new UserService(repository);

        const profile = await service.getProfile(userId);

        if (!profile) {
          // Profile missing - controlled, non-500 error for dashboard bootstrap flows
          const message = `[GET /users/me] Profile missing for user_id=${userId}`;
          request.log.warn({ userId, step: 'profile_fetch' }, message);

          sendError(
            reply,
            'PROFILE_NOT_READY',
            'User profile not ready. Please retry shortly.',
            409
          );
          return;
        }

        // If profile exists but no organization membership, return 200 with null organization
        // Frontend can use this to trigger bootstrap
        if (!profile.organization || !profile.membership) {
          request.log.info({ 
            userId, 
            step: 'membership_check',
            has_org: !!profile.organization,
            has_membership: !!profile.membership 
          }, 'Profile exists but no organization membership');
        }

        // Contract for dashboard:
        // {
        //   profile,
        //   organization,
        //   membership (includes role_key)
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
          membership: profile.membership ? {
            id: profile.membership.id,
            organization_id: profile.membership.organization_id,
            username: profile.membership.username,
            role_id: profile.membership.role_id,
            role_key: profile.membership.role_key,
            status: profile.membership.status,
          } : null,
        };

        sendSuccess(reply, responseBody);
      } catch (error: any) {
        // Extract PostgREST error details if available
        const errorMessage = error?.message || 'Failed to get user profile';
        const errorCode = error?.code || 'unknown';
        const step = error?.step || 'unknown';
        
        request.log.error({ 
          userId, 
          step,
          error_code: errorCode,
          error_message: errorMessage,
          error_details: error?.details 
        }, `[GET /users/me] Failed to get user profile: ${errorMessage}`);
        
        // Only return 500 for real unexpected errors
        // Schema mismatches should be fixed in code, not returned as 500
        sendError(
          reply, 
          'INTERNAL_ERROR', 
          `Failed to get user profile: ${errorMessage}`, 
          500
        );
      }
    }
  );
}
