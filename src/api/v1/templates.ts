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
import { createTemplateSchema, updateTemplateSchema, updateFieldsSchema } from '../../domains/templates/types.js';
import { parsePagination } from '../../lib/utils/validation.js';
import { sendSuccess, sendPaginated, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';
import { uploadRateLimitConfig } from '../../lib/security/rate-limit-presets.js';
import { config } from '../../lib/config/env.js';

/**
 * Register template routes
 */
export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/templates
   * List all templates for the authenticated organization
   * Query params:
   *   - include: comma-separated list of fields to include (e.g., "preview_url")
   *   - status: filter by status
   *   - page, limit, sort_by, sort_order: pagination options
   */
  app.get(
    '/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { page, limit, sort_by, sort_order } = parsePagination(request.query);
        const query = request.query as { status?: string; include?: string };
        const status = query.status;
        const include = query.include;

        // Check if preview_url should be included (batch optimization)
        const includePreviewUrl = include?.split(',').includes('preview_url') ?? false;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const { templates, total } = await service.list(request.context!.organizationId, {
          status,
          page,
          limit,
          sortBy: sort_by,
          sortOrder: sort_order,
          includePreviewUrl,
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

        const template = await service.getById(id, request.context!.organizationId);

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
   * Create new template using new schema (certificate_templates, certificate_template_versions, files)
   * 
   * Request: multipart/form-data
   *   - file: template source file (pdf/docx/pptx/png/jpg/webp)
   *   - title: string (required)
   *   - category_id: uuid (required)
   *   - subcategory_id: uuid (required)
   * 
   * Rate limited to prevent abuse (10 uploads per hour)
   */
  app.post(
    '/templates',
    {
      config: {
        rateLimit: config.RATE_LIMIT_ENABLED ? uploadRateLimitConfig : false,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;

      if (!organizationId) {
        request.log.warn({ userId }, '[POST /templates] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        // Parse multipart form data
        const data = await request.file();
        
        if (!data) {
          sendError(reply, 'VALIDATION_ERROR', 'File is required', 400);
          return;
        }

        // Parse form fields
        const titleField = data.fields?.title;
        const categoryIdField = data.fields?.category_id;
        const subcategoryIdField = data.fields?.subcategory_id;

        // Validate title (required, trimmed)
        let title: string;
        if (titleField && 'value' in titleField && titleField.value) {
          title = String(titleField.value).trim();
        } else {
          sendError(reply, 'VALIDATION_ERROR', 'Title is required', 400);
          return;
        }

        // Validate title length
        if (title.length === 0) {
          sendError(reply, 'VALIDATION_ERROR', 'Title is required', 400);
          return;
        }
        if (title.length > 255) {
          sendError(reply, 'VALIDATION_ERROR', 'Title must be 255 characters or less', 400);
          return;
        }

        if (!categoryIdField || !('value' in categoryIdField) || !categoryIdField.value) {
          sendError(reply, 'VALIDATION_ERROR', 'Category ID is required', 400);
          return;
        }

        if (!subcategoryIdField || !('value' in subcategoryIdField) || !subcategoryIdField.value) {
          sendError(reply, 'VALIDATION_ERROR', 'Subcategory ID is required', 400);
          return;
        }

        const categoryId = String(categoryIdField.value).trim();
        const subcategoryId = String(subcategoryIdField.value).trim();

        // Validate UUIDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(categoryId)) {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid category ID format', 400);
          return;
        }
        if (!uuidRegex.test(subcategoryId)) {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid subcategory ID format', 400);
          return;
        }

        // Read file buffer
        const buffer = await data.toBuffer();

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.createWithNewSchema(
          organizationId,
          userId,
          {
            title,
            category_id: categoryId,
            subcategory_id: subcategoryId,
          },
          {
            buffer,
            mimetype: data.mimetype ?? 'application/octet-stream',
            originalname: data.filename ?? 'template',
          }
        );

        const duration = Date.now() - startTime;

        // Log success
        request.log.info({
          userId,
          organizationId,
          template_id: result.template.id,
          version_id: result.version.id,
          storage_path: result.version.source_file.path,
          duration_ms: duration,
        }, '[POST /templates] Template created successfully');

        sendSuccess(reply, result, 201);
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof ValidationError) {
          const errorCode = (error.details?.code as string) || 'VALIDATION_ERROR';
          request.log.warn({
            userId,
            organizationId,
            error: error.message,
            error_code: errorCode,
            duration_ms: duration,
          }, '[POST /templates] Validation error');

          sendError(reply, errorCode, error.message, 400, error.details);
        } else {
          // Handle storage path constraint errors
          const { handleStoragePathConstraintError } = await import('../../lib/storage/path-validator.js');
          const constraintError = handleStoragePathConstraintError(
            error,
            (error as any)?.attempted_path || 'unknown',
            organizationId,
            (error as any)?.template_id
          );

          if (constraintError instanceof ValidationError) {
            request.log.warn({
              userId,
              organizationId,
              error: constraintError.message,
              error_code: constraintError.details?.code,
              attempted_path: constraintError.details?.attempted_path,
              duration_ms: duration,
            }, '[POST /templates] Storage path constraint violation');

            sendError(reply, constraintError.details?.code as string || 'STORAGE_PATH_ERROR', constraintError.message, 400, constraintError.details);
          } else {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create template';
            request.log.error({
              userId,
              organizationId,
              error: errorMessage,
              duration_ms: duration,
            }, '[POST /templates] Failed to create template');

            sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
          }
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

        const template = await service.update(id, request.context!.organizationId, dto);

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

        await service.delete(id, request.context!.organizationId);

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

        const previewUrl = await service.getPreviewUrl(id, request.context!.organizationId);

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
   * Get certificate categories for the authenticated organization
   */
  app.get(
    '/templates/categories',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.getCategories(request.context!.organizationId);

        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to get categories');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to get categories', 500);
      }
    }
  );

  /**
   * GET /api/v1/templates/:templateId/editor
   * Get template editor data (template + version + files + fields)
   * Returns everything editor needs in one response
   */
  app.get(
    '/templates/:templateId/editor',
    async (request: FastifyRequest<{ Params: { templateId: string } }>, reply: FastifyReply) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const templateId = request.params.templateId;

      if (!organizationId) {
        request.log.warn({ userId }, '[GET /templates/:templateId/editor] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.getTemplateForEditor(templateId, organizationId);

        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: result.latest_version.id,
          fields_count: result.fields.length,
        }, '[GET /templates/:templateId/editor] Successfully fetched template editor data');

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
          }, '[GET /templates/:templateId/editor] Template not found');

          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Failed to get template editor data';
          request.log.error({
            userId,
            organizationId,
            template_id: templateId,
            error: errorMessage,
          }, '[GET /templates/:templateId/editor] Failed to get template editor data');

          sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
        }
      }
    }
  );

  /**
   * PUT /api/v1/templates/:templateId/versions/:versionId/fields
   * Update fields for a template version (replace semantics)
   * Deletes existing fields and inserts new ones atomically
   */
  app.put(
    '/templates/:templateId/versions/:versionId/fields',
    async (
      request: FastifyRequest<{
        Params: { templateId: string; versionId: string };
        Body: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const templateId = request.params.templateId;
      const versionId = request.params.versionId;

      if (!organizationId) {
        request.log.warn({ userId }, '[PUT /templates/:templateId/versions/:versionId/fields] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        // Parse and validate request body
        const dto = updateFieldsSchema.parse(request.body);

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.updateFields(templateId, versionId, organizationId, dto);

        // Create audit log
        try {
          const supabase = getSupabaseClient();
          await supabase.from('app_audit_logs').insert({
            organization_id: organizationId,
            actor_user_id: userId,
            action: 'template.fields_updated',
            entity_type: 'certificate_template_version',
            entity_id: versionId,
            metadata: {
              template_id: templateId,
              version_id: versionId,
              fields_count: result.fields_count,
            },
          } as any);
        } catch (auditError) {
          // Audit log failures are non-fatal
          request.log.warn({ error: auditError }, '[PUT /templates/:templateId/versions/:versionId/fields] Failed to create audit log');
        }

        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: versionId,
          fields_count: result.fields_count,
        }, '[PUT /templates/:templateId/versions/:versionId/fields] Successfully updated fields');

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
          }, '[PUT /templates/:templateId/versions/:versionId/fields] Template or version not found');

          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else if (error instanceof ValidationError) {
          const field = (error.details?.field as string) || 'unknown';
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
            field,
            error: error.message,
          }, '[PUT /templates/:templateId/versions/:versionId/fields] Validation error');

          sendError(reply, 'VALIDATION_ERROR', error.message, 400, {
            ...error.details,
            field,
          });
        } else if (error instanceof Error && error.name === 'ZodError') {
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
            error: error.message,
          }, '[PUT /templates/:templateId/versions/:versionId/fields] Schema validation error');

          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update fields';
          request.log.error({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
            error: errorMessage,
          }, '[PUT /templates/:templateId/versions/:versionId/fields] Failed to update fields');

          sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/templates/:templateId/versions/:versionId/preview
   * Generate preview for a template version
   * Idempotent: returns existing preview if already generated
   */
  app.post(
    '/templates/:templateId/versions/:versionId/preview',
    async (
      request: FastifyRequest<{
        Params: { templateId: string; versionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const templateId = request.params.templateId;
      const versionId = request.params.versionId;

      if (!organizationId) {
        request.log.warn({ userId }, '[POST /templates/:templateId/versions/:versionId/preview] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.generatePreview(templateId, versionId, organizationId, userId);

        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: versionId,
          status: result.status,
          preview_file_id: result.preview_file_id,
        }, '[POST /templates/:templateId/versions/:versionId/preview] Preview generation completed');

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
          }, '[POST /templates/:templateId/versions/:versionId/preview] Template or version not found');

          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Failed to generate preview';
          request.log.error({
            userId,
            organizationId,
            template_id: templateId,
            version_id: versionId,
            error: errorMessage,
          }, '[POST /templates/:templateId/versions/:versionId/preview] Failed to generate preview');

          sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
        }
      }
    }
  );
}
