/**
 * CERTIFICATES API
 *
 * RESTful API endpoints for certificate generation.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { idempotencyPreHandler } from '../../lib/middleware/idempotency.js';
import { TemplateRepository } from '../../domains/templates/repository.js';
import { CertificateService } from '../../domains/certificates/service.js';
import { generateCertificatesSchema } from '../../domains/certificates/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

/**
 * Register certificate routes
 */
export async function registerCertificateRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * POST /api/v1/certificates/generate
   * Generate certificates from template and data
   * Uses idempotency protection to prevent duplicate generation on network retries
   */
  app.post(
    '/certificates/generate',
    {
      preHandler: idempotencyPreHandler, // Prevent duplicate operations
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = generateCertificatesSchema.parse(request.body);

        const templateRepository = new TemplateRepository(getSupabaseClient());
        const certificateService = new CertificateService(templateRepository);

        const appUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3001';

        const result = await certificateService.generateCertificates(
          request.context!.companyId,
          request.context!.userId,
          body,
          appUrl
        );

        if (result.status === 'pending' && result.job_id) {
          // Async job - return 202 Accepted
          sendSuccess(reply, result, 202);
        } else {
          // Synchronous completion - return 200 OK
          sendSuccess(reply, result);
        }
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to generate certificates');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to generate certificates', 500);
        }
      }
    }
  );
}
