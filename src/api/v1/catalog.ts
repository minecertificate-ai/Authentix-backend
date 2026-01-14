/**
 * CATALOG API
 *
 * RESTful API endpoints for catalog/category management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { CatalogRepository } from '../../domains/catalog/repository.js';
import { CatalogService } from '../../domains/catalog/service.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { ConflictError, NotFoundError } from '../../lib/errors/handler.js';

/**
 * Register catalog routes
 */
export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/catalog/categories
   * Get categories for the authenticated organization
   * Returns grouped categories suitable for dropdown dividers
   */
  app.get(
    '/catalog/categories',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;

      if (!organizationId) {
        request.log.warn({ userId }, '[GET /catalog/categories] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        const repository = new CatalogRepository(getSupabaseClient());
        const service = new CatalogService(repository);

        const result = await service.getCategories(organizationId);

        // Log success
        const categoryCount = result.flat?.length || 0;
        const groupCount = result.groups.length;
        request.log.info({
          organizationId,
          userId,
          categoryCount,
          groupCount,
        }, '[GET /catalog/categories] Successfully fetched categories');

        sendSuccess(reply, result);
      } catch (error) {
        // Handle industry missing error (409)
        if (error instanceof ConflictError && error.details?.code === 'ORG_INDUSTRY_REQUIRED') {
          request.log.warn({
            organizationId,
            userId,
            step: 'industry_check',
          }, '[GET /catalog/categories] Organization industry is not set');

          sendError(
            reply,
            'ORG_INDUSTRY_REQUIRED',
            error.message || 'Organization industry is required before selecting categories',
            409,
            {
              org_id: organizationId,
            }
          );
          return;
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Failed to get categories';
        request.log.error({
          organizationId,
          userId,
          error: errorMessage,
          step: 'fetch_categories',
        }, '[GET /catalog/categories] Failed to get categories');

        sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
      }
    }
  );

  /**
   * GET /api/v1/catalog/categories/:categoryId/subcategories
   * Get subcategories for a selected category
   * Returns org-scoped subcategories respecting overrides and hide flags
   */
  app.get(
    '/catalog/categories/:categoryId/subcategories',
    async (request: FastifyRequest<{ Params: { categoryId: string } }>, reply: FastifyReply) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const categoryId = request.params.categoryId;

      if (!organizationId) {
        request.log.warn({ userId }, '[GET /catalog/categories/:categoryId/subcategories] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        const repository = new CatalogRepository(getSupabaseClient());
        const service = new CatalogService(repository);

        const result = await service.getSubcategories(organizationId, categoryId);

        // Log success
        const itemCount = result.items.length;
        request.log.info({
          organizationId,
          userId,
          categoryId,
          itemCount,
        }, '[GET /catalog/categories/:categoryId/subcategories] Successfully fetched subcategories');

        sendSuccess(reply, result);
      } catch (error) {
        // Handle category not found error (404)
        if (error instanceof NotFoundError) {
          const errorCode = (error as any).details?.code || 'NOT_FOUND';
          const statusCode = errorCode === 'category_not_found_for_org' ? 404 : 404;
          
          request.log.warn({
            organizationId,
            userId,
            categoryId,
            step: 'category_validation',
            error_code: errorCode,
          }, '[GET /catalog/categories/:categoryId/subcategories] Category not found or invalid');

          sendError(
            reply,
            errorCode,
            error.message || 'Category not found',
            statusCode,
            (error as any).details
          );
          return;
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Failed to get subcategories';
        request.log.error({
          organizationId,
          userId,
          categoryId,
          error: errorMessage,
          step: 'fetch_subcategories',
        }, '[GET /catalog/categories/:categoryId/subcategories] Failed to get subcategories');

        sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
      }
    }
  );
}
