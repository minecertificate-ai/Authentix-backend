/**
 * COMPANIES API
 *
 * RESTful API endpoints for company management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { CompanyRepository } from '../../domains/companies/repository.js';
import { CompanyService } from '../../domains/companies/service.js';
import { updateCompanySchema } from '../../domains/companies/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

/**
 * Register company routes
 */
export async function registerCompanyRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/companies/me
   * Get current user's company
   */
  app.get(
    '/companies/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        const company = await service.getById(request.context!.organizationId);

        sendSuccess(reply, company);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get company');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get company', 500);
        }
      }
    }
  );

  /**
   * PUT /api/v1/companies/me
   * Update current user's company
   */
  app.put(
    '/companies/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check if multipart form (for logo upload)
        const isMultipart = request.headers['content-type']?.includes('multipart/form-data');
        
        let dto: unknown;
        let logoFile: { buffer: Buffer; mimetype: string; originalname: string } | undefined;

        if (isMultipart) {
          const data = await request.file();
          if (!data) {
            sendError(reply, 'VALIDATION_ERROR', 'No file provided', 400);
            return;
          }

          // Parse JSON metadata from form field
          const metadataField = data.fields?.metadata;
          if (metadataField && 'value' in metadataField) {
            dto = JSON.parse(metadataField.value as string);
          } else {
            sendError(reply, 'VALIDATION_ERROR', 'Company data is required', 400);
            return;
          }

          // Read logo file if provided
          if (data.filename) {
            const buffer = await data.toBuffer();
            logoFile = {
              buffer,
              mimetype: data.mimetype ?? 'image/png',
              originalname: data.filename,
            };
          }
        } else {
          dto = request.body;
        }

        const validatedDto = updateCompanySchema.parse(dto);

        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        const company = await service.update(request.context!.organizationId, validatedDto, logoFile);

        sendSuccess(reply, company);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to update company');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to update company', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/companies/me/api-settings
   * Get API settings for current company
   */
  app.get(
    '/companies/me/api-settings',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        const settings = await service.getAPISettings(request.context!.organizationId);

        sendSuccess(reply, settings);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get API settings');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get API settings', 500);
        }
      }
    }
  );

  /**
   * PUT /api/v1/companies/me/api-settings
   * Update API enabled status
   */
  app.put(
    '/companies/me/api-settings',
    async (request: FastifyRequest<{ Body: { api_enabled: boolean } }>, reply: FastifyReply) => {
      try {
        const { api_enabled } = request.body;

        if (typeof api_enabled !== 'boolean') {
          sendError(reply, 'VALIDATION_ERROR', 'api_enabled must be a boolean', 400);
          return;
        }

        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        await service.updateAPIEnabled(request.context!.organizationId, api_enabled);

        sendSuccess(reply, { api_enabled });
      } catch (error) {
        request.log.error(error, 'Failed to update API settings');
        sendError(reply, 'INTERNAL_ERROR', 'Failed to update API settings', 500);
      }
    }
  );

  /**
   * POST /api/v1/companies/me/bootstrap-identity
   * Bootstrap or regenerate company identity (application_id and API key)
   */
  app.post(
    '/companies/me/bootstrap-identity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        const result = await service.bootstrapIdentity(request.context!.organizationId, request.context!.userId);

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to bootstrap identity');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to bootstrap identity', 500);
        }
      }
    }
  );

  /**
   * POST /api/v1/companies/me/rotate-api-key
   * Rotate API key (keep application_id)
   */
  app.post(
    '/companies/me/rotate-api-key',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new CompanyRepository(getSupabaseClient());
        const service = new CompanyService(repository);

        const result = await service.rotateAPIKey(request.context!.organizationId);

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to rotate API key');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to rotate API key', 500);
        }
      }
    }
  );
}
