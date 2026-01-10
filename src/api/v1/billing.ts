/**
 * BILLING API
 *
 * RESTful API endpoints for billing and invoice management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { BillingRepository } from '../../domains/billing/repository.js';
import { BillingService } from '../../domains/billing/service.js';
import { parsePagination } from '../../lib/utils/validation.js';
import { sendSuccess, sendPaginated, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError } from '../../lib/errors/handler.js';

/**
 * Register billing routes
 */
export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/billing/invoices
   * List all invoices for the authenticated company
   */
  app.get(
    '/billing/invoices',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { page, limit, sort_by, sort_order } = parsePagination(request.query);
        const status = (request.query as { status?: string }).status;

        const repository = new BillingRepository(getSupabaseClient());
        const service = new BillingService(repository);

        const { invoices, total } = await service.listInvoices(
          request.context!.companyId,
          {
            status,
            page,
            limit,
            sortBy: sort_by,
            sortOrder: sort_order,
          }
        );

        sendPaginated(reply, {
          items: invoices,
          pagination: {
            page: page ?? 1,
            limit: limit ?? 20,
            total,
            total_pages: Math.ceil(total / (limit ?? 20)),
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to list invoices');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to list invoices', 500);
      }
    }
  );

  /**
   * GET /api/v1/billing/invoices/:id
   * Get invoice by ID with line items
   */
  app.get(
    '/billing/invoices/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new BillingRepository(getSupabaseClient());
        const service = new BillingService(repository);

        const result = await service.getInvoiceWithLineItems(
          id,
          request.context!.companyId
        );

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get invoice');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get invoice', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/billing/overview
   * Get billing overview (current period, recent invoices, outstanding)
   */
  app.get(
    '/billing/overview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new BillingRepository(getSupabaseClient());
        const service = new BillingService(repository);

        const overview = await service.getBillingOverview(request.context!.companyId);

        sendSuccess(reply, overview);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get billing overview');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get billing overview', 500);
        }
      }
    }
  );
}
