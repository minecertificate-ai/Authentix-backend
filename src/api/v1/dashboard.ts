/**
 * DASHBOARD API
 *
 * RESTful API endpoints for dashboard statistics.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { DashboardRepository } from '../../domains/dashboard/repository.js';
import { DashboardService } from '../../domains/dashboard/service.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';

/**
 * Register dashboard routes
 */
export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/dashboard/stats
   * Get dashboard statistics and recent activity
   */
  app.get(
    '/dashboard/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new DashboardRepository(getSupabaseClient());
        const service = new DashboardService(repository);

        const data = await service.getDashboardData(request.context!.organizationId);

        sendSuccess(reply, data);
      } catch (error) {
        request.log.error(error, 'Failed to get dashboard stats');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to get dashboard stats', 500);
      }
    }
  );
}
