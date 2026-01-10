/**
 * VERIFICATION API
 *
 * RESTful API endpoints for certificate verification (public).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VerificationService } from '../../domains/verification/service.js';
import { verifyCertificateSchema } from '../../domains/verification/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';

/**
 * Register verification routes
 */
export async function registerVerificationRoutes(app: FastifyInstance): Promise<void> {
  // Verification is public (no auth required)

  /**
   * POST /api/v1/verification/verify
   * Verify certificate by token (public endpoint)
   */
  app.post(
    '/verification/verify',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = verifyCertificateSchema.parse(request.body);
        const token = body.token;

        const service = new VerificationService(getSupabaseClient());

        // Extract request info for logging
        const ip = request.ip ?? request.headers['x-forwarded-for'] ?? undefined;
        const userAgent = request.headers['user-agent'] ?? undefined;

        const result = await service.verifyCertificate(token, {
          ip: typeof ip === 'string' ? ip : undefined,
          userAgent,
        });

        sendSuccess(reply, result);
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to verify certificate');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to verify certificate', 500);
        }
      }
    }
  );
}
