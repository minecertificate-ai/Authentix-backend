/**
 * IMPORTS API
 *
 * RESTful API endpoints for import job management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { ImportRepository } from '../../domains/imports/repository.js';
import { ImportService } from '../../domains/imports/service.js';
import { createImportJobSchema } from '../../domains/imports/types.js';
import { parsePagination } from '../../lib/utils/validation.js';
import { sendSuccess, sendPaginated, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

/**
 * Register import routes
 */
export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/import-jobs
   * List all import jobs for the authenticated company
   */
  app.get(
    '/import-jobs',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { page, limit, sort_by, sort_order } = parsePagination(request.query);
        const status = (request.query as { status?: string }).status;

        const repository = new ImportRepository(getSupabaseClient());
        const service = new ImportService(repository);

        const { jobs, total } = await service.list(request.context!.companyId, {
          status,
          page,
          limit,
          sortBy: sort_by,
          sortOrder: sort_order,
        });

        sendPaginated(reply, {
          items: jobs,
          pagination: {
            page: page ?? 1,
            limit: limit ?? 20,
            total,
            total_pages: Math.ceil(total / (limit ?? 20)),
          },
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else {
          request.log.error(error, 'Failed to list import jobs');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to list import jobs', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/import-jobs/:id
   * Get import job by ID
   */
  app.get(
    '/import-jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new ImportRepository(getSupabaseClient());
        const service = new ImportService(repository);

        const job = await service.getById(id, request.context!.companyId);

        sendSuccess(reply, job);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get import job');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get import job', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/import-jobs
   * Create new import job
   */
  app.post(
    '/import-jobs',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Parse multipart form data
        const data = await request.file();

        if (!data) {
          sendError(reply, 'VALIDATION_ERROR', 'File is required', 400);
          return;
        }

        // Parse JSON metadata from form field
        let metadata: unknown;
        const metadataField = data.fields?.metadata;

        if (metadataField && 'value' in metadataField) {
          metadata = JSON.parse(metadataField.value as string);
        } else {
          // Try to get from request body if not in multipart
          metadata = request.body as unknown;
        }

        if (!metadata) {
          sendError(reply, 'VALIDATION_ERROR', 'Import metadata is required', 400);
          return;
        }

        const dto = createImportJobSchema.parse(metadata);

        // Read file buffer
        const buffer = await data.toBuffer();

        const repository = new ImportRepository(getSupabaseClient());
        const service = new ImportService(repository);

        const job = await service.create(
          request.context!.companyId,
          request.context!.userId,
          dto,
          {
            buffer,
            mimetype: data.mimetype ?? 'application/octet-stream',
            originalname: data.filename ?? 'import',
          }
        );

        sendSuccess(reply, job, 201);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to create import job');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to create import job', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/import-jobs/:id/data
   * Get import data rows
   */
  app.get(
    '/import-jobs/:id/data',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { page, limit } = parsePagination(request.query);

        const repository = new ImportRepository(getSupabaseClient());
        const service = new ImportService(repository);

        const { rows, total } = await service.getDataRows(
          id,
          request.context!.companyId,
          { page, limit }
        );

        sendPaginated(reply, {
          items: rows,
          pagination: {
            page: page ?? 1,
            limit: limit ?? 100,
            total,
            total_pages: Math.ceil(total / (limit ?? 100)),
          },
        });
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get import data');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get import data', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/import-jobs/:id/download
   * Get signed URL for import file download
   */
  app.get(
    '/import-jobs/:id/download',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new ImportRepository(getSupabaseClient());
        const service = new ImportService(repository);

        const downloadUrl = await service.getFileUrl(id, request.context!.companyId);

        sendSuccess(reply, { download_url: downloadUrl });
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get download URL');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get download URL', 500);
        }
      }
    }
  );
}
