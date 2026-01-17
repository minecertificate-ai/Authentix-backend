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
   *   - page, limit, sort_by, sort_order: pagination options
   * Note: All templates are active and ready to use (status filtering removed)
   */
  app.get(
    '/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      
      try {
        const { page, limit, sort_by, sort_order } = parsePagination(request.query);
        const query = request.query as { include?: string };
        const include = query.include;

        // Log incoming request data
        request.log.info({
          userId,
          organizationId,
          query_params: {
            page,
            limit,
            sort_by,
            sort_order,
            include,
          },
        }, '[GET /templates] Request received from frontend');

        // Check if preview_url should be included (batch optimization)
        const includePreviewUrl = include?.split(',').includes('preview_url') ?? false;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        request.log.info({
          userId,
          organizationId,
          service_options: {
            page,
            limit,
            sortBy: sort_by,
            sortOrder: sort_order,
            includePreviewUrl,
          },
        }, '[GET /templates] Calling service.list()');

        // Note: Status filtering removed - all templates are active and ready to use
        const { templates, total } = await service.list(organizationId, {
          page,
          limit,
          sortBy: sort_by,
          sortOrder: sort_order,
          includePreviewUrl,
        });

        // Transform templates to include new schema fields
        const transformedTemplates = templates.map(t => {
          const template = t as any;
          return {
            ...template,
            // Ensure title is present (from new schema) or fallback to name (legacy)
            title: template.title || template.name,
            // Include category/subcategory IDs from new schema
            category_id: template.category_id,
            subcategory_id: template.subcategory_id,
            // Include category/subcategory names
            category_name: template.certificate_category,
            subcategory_name: template.certificate_subcategory,
          };
        });

        // Log data fetched from DB
        request.log.info({
          userId,
          organizationId,
          db_results: {
            templates_count: templates.length,
            total_count: total,
            template_ids: templates.map(t => t.id),
            first_template: transformedTemplates[0] ? {
              id: transformedTemplates[0].id,
              title: transformedTemplates[0].title,
              category_id: transformedTemplates[0].category_id,
              subcategory_id: transformedTemplates[0].subcategory_id,
            } : null,
          },
        }, '[GET /templates] Data fetched from database');

        const responseData = {
          items: transformedTemplates,
          pagination: {
            page: page ?? 1,
            limit: limit ?? 20,
            total,
            total_pages: Math.ceil(total / (limit ?? 20)),
          },
        };

        // Log response data being sent to frontend
        request.log.info({
          userId,
          organizationId,
          response: {
            items_count: responseData.items.length,
            pagination: responseData.pagination,
            first_template: transformedTemplates[0] ? {
              id: transformedTemplates[0].id,
              title: transformedTemplates[0].title,
              category_id: transformedTemplates[0].category_id,
              subcategory_id: transformedTemplates[0].subcategory_id,
              status: transformedTemplates[0].status,
            } : null,
          },
        }, '[GET /templates] Sending response to frontend');

        sendPaginated(reply, responseData);
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
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const { id } = request.params;

      try {
        // Log incoming request
        request.log.info({
          userId,
          organizationId,
          template_id: id,
        }, '[GET /templates/:id] Request received from frontend');

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const template = await service.getById(id, organizationId);

        // Log data fetched from DB
        request.log.info({
          userId,
          organizationId,
          template_id: id,
          template_data: {
            id: template.id,
            title: (template as any).title || template.name,
            // status: removed - all templates are active and ready to use
            has_storage_path: !!template.storage_path,
            has_preview_url: !!template.preview_url,
          },
        }, '[GET /templates/:id] Data fetched from database');

        // Log response being sent
        request.log.info({
          userId,
          organizationId,
          template_id: id,
        }, '[GET /templates/:id] Sending response to frontend');

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
        // Parse multipart data - IMPORTANT: Must consume each part before moving to next
        // In @fastify/multipart, parts are streams that must be fully read in order
        const parts = request.parts();
        let fileBuffer: Buffer | null = null;
        let fileMetadata: { filename: string; mimetype: string; encoding: string; fieldname: string } | null = null;
        const formFields: Record<string, string> = {};

        // Iterate through all parts and consume each one immediately
        for await (const part of parts) {
          if (part.type === 'file') {
            // CRITICAL: Must consume file buffer immediately before continuing to next part
            // Streams must be fully read before moving on, otherwise they become invalid
            fileBuffer = await part.toBuffer();
            fileMetadata = {
              filename: part.filename,
              mimetype: part.mimetype,
              encoding: part.encoding,
              fieldname: part.fieldname,
            };
          } else {
            // Form field - read the value
            try {
              const value = await part.value;
              if (typeof value === 'string') {
                formFields[part.fieldname] = value;
              }
            } catch (fieldError) {
              request.log.warn({
                userId,
                organizationId,
                fieldname: part.fieldname,
                error: fieldError instanceof Error ? fieldError.message : 'Unknown error',
              }, '[POST /templates] Failed to read form field');
            }
          }
        }

        if (!fileBuffer || !fileMetadata) {
          request.log.warn({
            userId,
            organizationId,
          }, '[POST /templates] No file received from frontend');
          sendError(reply, 'VALIDATION_ERROR', 'File is required', 400);
          return;
        }

        // Log incoming request data
        request.log.info({
          userId,
          organizationId,
          file_info: {
            filename: fileMetadata.filename,
            mimetype: fileMetadata.mimetype,
            encoding: fileMetadata.encoding,
            fieldname: fileMetadata.fieldname,
            size_bytes: fileBuffer.length,
          },
          form_fields: formFields,
          form_fields_keys: Object.keys(formFields),
          has_title: 'title' in formFields,
          has_category_id: 'category_id' in formFields,
          has_subcategory_id: 'subcategory_id' in formFields,
        }, '[POST /templates] Request received from frontend');

        // Parse form fields
        const title = formFields.title?.trim() || '';
        const categoryId = formFields.category_id?.trim() || '';
        const subcategoryId = formFields.subcategory_id?.trim() || '';

        // Validate required fields
        if (!title) {
          sendError(reply, 'VALIDATION_ERROR', 'Title is required', 400);
          return;
        }
        if (title.length > 255) {
          sendError(reply, 'VALIDATION_ERROR', 'Title must be 255 characters or less', 400);
          return;
        }
        if (!categoryId) {
          sendError(reply, 'VALIDATION_ERROR', 'Category ID is required', 400);
          return;
        }
        if (!subcategoryId) {
          sendError(reply, 'VALIDATION_ERROR', 'Subcategory ID is required', 400);
          return;
        }

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

        request.log.info({
          userId,
          organizationId,
          parsed_data: {
            title,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            file_size_bytes: fileBuffer.length,
            mimetype: fileMetadata.mimetype || 'application/octet-stream',
          },
        }, '[POST /templates] Parsed request data, calling service.createWithNewSchema()');

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
            buffer: fileBuffer,
            mimetype: fileMetadata.mimetype || 'application/octet-stream',
            originalname: fileMetadata.filename || 'template',
          }
        );

        // Log data returned from service
        request.log.info({
          userId,
          organizationId,
          service_result: {
            template_id: result.template.id,
            template_title: result.template.title,
            version_id: result.version.id,
            version_number: result.version.version_number,
            source_file_id: result.version.source_file.id,
            storage_path: result.version.source_file.path,
          },
        }, '[POST /templates] Data created in database');

        const duration = Date.now() - startTime;

        // Log success and response being sent
        request.log.info({
          userId,
          organizationId,
          template_id: result.template.id,
          version_id: result.version.id,
          storage_path: result.version.source_file.path,
          duration_ms: duration,
          response_data: {
            template: {
              id: result.template.id,
              title: result.template.title,
              // status: removed - all templates are active and ready to use
            },
            version: {
              id: result.version.id,
              version_number: result.version.version_number,
            },
          },
        }, '[POST /templates] Template created successfully, sending response to frontend');

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
   * GET /api/v1/templates/:id/preview-url
   * Get signed preview URL (alias for /preview)
   * Note: This route must be defined before /preview to ensure correct matching
   */
  app.get(
    '/templates/:id/preview-url',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const previewUrl = await service.getPreviewUrl(id, request.context!.organizationId);

        sendSuccess(reply, { url: previewUrl });
      } catch (error) {
        if (error instanceof NotFoundError) {
          // Return a more specific error code for missing preview
          sendError(reply, 'TEMPLATE_PREVIEW_NOT_AVAILABLE', 'Template preview not available', 404);
        } else {
          request.log.error(error, 'Failed to get preview URL');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get preview URL', 500);
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
        // Log incoming request
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
        }, '[GET /templates/:templateId/editor] Request received from frontend');

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.getTemplateForEditor(templateId, organizationId);

        // Log data fetched from DB
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          db_data: {
            template: {
              id: result.template.id,
              title: result.template.title,
              // status: removed - all templates are active and ready to use
            },
            version: {
              id: result.latest_version.id,
              version_number: result.latest_version.version_number,
              page_count: result.latest_version.page_count,
            },
            source_file: result.source_file ? {
              id: result.source_file.id,
              bucket: result.source_file.bucket,
              path: result.source_file.path,
            } : null,
            fields_count: result.fields.length,
            fields: result.fields.map(f => ({
              id: f.id,
              field_key: f.field_key,
              label: f.label,
              type: f.type,
            })),
          },
        }, '[GET /templates/:templateId/editor] Data fetched from database');

        // Log response being sent
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: result.latest_version.id,
          fields_count: result.fields.length,
        }, '[GET /templates/:templateId/editor] Sending response to frontend');

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
        // Log incoming request
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: versionId,
          request_body: request.body,
        }, '[PUT /templates/:templateId/versions/:versionId/fields] Request received from frontend');

        // Parse and validate request body
        const dto = updateFieldsSchema.parse(request.body);

        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: versionId,
          parsed_fields: {
            fields_count: dto.fields.length,
            fields: dto.fields.map(f => ({
              field_key: f.field_key,
              label: f.label,
              type: f.type,
              page_number: f.page_number,
            })),
          },
        }, '[PUT /templates/:templateId/versions/:versionId/fields] Parsed request data, calling service.updateFields()');

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.updateFields(templateId, versionId, organizationId, dto);

        // Log data updated in DB
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          version_id: versionId,
          db_result: {
            fields_count: result.fields_count,
            updated_at: result.updated_at,
            field_ids: result.fields.map(f => f.id),
          },
        }, '[PUT /templates/:templateId/versions/:versionId/fields] Data updated in database');

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

  // ============================================================================
  // TEMPLATE USAGE HISTORY ENDPOINTS
  // ============================================================================

  /**
   * GET /api/v1/templates/recent-usage
   * Get recently used templates for the current user
   * Returns both generated templates and in-progress designs
   */
  app.get(
    '/templates/recent-usage',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;

      if (!organizationId) {
        request.log.warn({ userId }, '[GET /templates/recent-usage] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      try {
        request.log.info({
          userId,
          organizationId,
          limit,
        }, '[GET /templates/recent-usage] Fetching recent template usage');

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.getRecentUsage(organizationId, userId, { limit });

        request.log.info({
          userId,
          organizationId,
          recent_generated_count: result.recent_generated.length,
          in_progress_count: result.in_progress.length,
        }, '[GET /templates/recent-usage] Recent usage fetched successfully');

        sendSuccess(reply, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch recent usage';
        request.log.error({
          userId,
          organizationId,
          error: errorMessage,
        }, '[GET /templates/recent-usage] Failed to fetch recent usage');

        sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
      }
    }
  );

  /**
   * POST /api/v1/templates/:templateId/save-progress
   * Save in-progress design for a template
   * Called when user is designing fields but hasn't generated yet
   */
  app.post(
    '/templates/:templateId/save-progress',
    async (
      request: FastifyRequest<{
        Params: { templateId: string };
        Body: { template_version_id?: string; field_snapshot: Record<string, unknown>[] };
      }>,
      reply: FastifyReply
    ) => {
      const organizationId = request.context!.organizationId;
      const userId = request.context!.userId;
      const templateId = request.params.templateId;
      const { template_version_id, field_snapshot } = request.body;

      if (!organizationId) {
        request.log.warn({ userId }, '[POST /templates/:templateId/save-progress] Organization ID missing from auth context');
        sendError(reply, 'BAD_REQUEST', 'Organization ID is required', 400);
        return;
      }

      if (!Array.isArray(field_snapshot)) {
        sendError(reply, 'VALIDATION_ERROR', 'field_snapshot must be an array', 400);
        return;
      }

      try {
        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          fields_count: field_snapshot.length,
        }, '[POST /templates/:templateId/save-progress] Saving in-progress design');

        const repository = new TemplateRepository(getSupabaseClient());
        const service = new TemplateService(repository);

        const result = await service.saveInProgressDesign(
          organizationId,
          userId,
          templateId,
          template_version_id ?? null,
          field_snapshot
        );

        request.log.info({
          userId,
          organizationId,
          template_id: templateId,
          usage_id: result.id,
        }, '[POST /templates/:templateId/save-progress] In-progress design saved');

        sendSuccess(reply, { id: result.id, saved: true });
      } catch (error) {
        if (error instanceof NotFoundError) {
          request.log.warn({
            userId,
            organizationId,
            template_id: templateId,
          }, '[POST /templates/:templateId/save-progress] Template not found');

          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Failed to save in-progress design';
          request.log.error({
            userId,
            organizationId,
            template_id: templateId,
            error: errorMessage,
          }, '[POST /templates/:templateId/save-progress] Failed to save in-progress design');

          sendError(reply, 'INTERNAL_ERROR', errorMessage, 500);
        }
      }
    }
  );
}
