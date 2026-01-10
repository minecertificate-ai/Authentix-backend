/**
 * TEMPLATES API
 *
 * RESTful API endpoints for certificate template management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { TemplateRepository } from '../../domains/templates/repository.js';
import { TemplateService } from '../../domains/templates/service.js';
import { createTemplateSchema, updateTemplateSchema } from '../../domains/templates/types.js';
import { parsePagination } from '../../lib/utils/validation.js';
import { sendSuccess, sendPaginated, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

/**
 * Register template routes
 */
export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/templates
   * List all templates for the authenticated company
   */
  app.get(
    '/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { page, limit, sort_by, sort_order } = parsePagination(request.query);
        const status = (request.query as { status?: string }).status;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const { templates, total } = await service.list(request.context!.companyId, {
          status,
          page,
          limit,
          sortBy: sort_by,
          sortOrder: sort_order,
        });

        sendPaginated(reply, {
          items: templates,
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
          request.log.error(error, 'Failed to list templates');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to list templates', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/templates/:id
   * Get template by ID
   */
  app.get(
    '/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const template = await service.getById(id, request.context!.companyId);

        sendSuccess(reply, template);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get template');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get template', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/templates
   * Create new template
   */
  app.post(
    '/templates',
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
          sendError(reply, 'VALIDATION_ERROR', 'Template metadata is required', 400);
          return;
        }

        const dto = createTemplateSchema.parse(metadata);

        // Read file buffer
        const buffer = await data.toBuffer();

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const template = await service.create(
          request.context!.companyId,
          request.context!.userId,
          dto,
          {
            buffer,
            mimetype: data.mimetype ?? 'application/octet-stream',
            originalname: data.filename ?? 'template',
          }
        );

        sendSuccess(reply, template, 201);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to create template');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to create template', 500);
        }
      }
    }
  );

  /**
   * PUT /api/v1/templates/:id
   * Update template
   */
  app.put(
    '/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const dto = updateTemplateSchema.parse(request.body);

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const template = await service.update(id, request.context!.companyId, dto);

        sendSuccess(reply, template);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to update template');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to update template', 500);
        }
      }
    }
  );

  /**
   * DELETE /api/v1/templates/:id
   * Delete template (soft delete)
   */
  app.delete(
    '/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        await service.delete(id, request.context!.companyId);

        sendSuccess(reply, { id, deleted: true });
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to delete template');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to delete template', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/templates/:id/preview
   * Get signed preview URL
   */
  app.get(
    '/templates/:id/preview',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const previewUrl = await service.getPreviewUrl(id, request.context!.companyId);

        sendSuccess(reply, { preview_url: previewUrl });
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get preview URL');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get preview URL', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/templates/categories
   * Get certificate categories for the authenticated company
   */
  app.get(
    '/templates/categories',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.getCategories(request.context!.companyId);

        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to get categories');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to get categories', 500);
      }
    }
  );
}
