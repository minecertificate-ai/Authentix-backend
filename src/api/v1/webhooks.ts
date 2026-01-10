/**
 * WEBHOOKS API
 *
 * RESTful API endpoints for webhook handlers.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { processRazorpayWebhook } from '../../domains/webhooks/razorpay-handler.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';

/**
 * Register webhook routes
 */
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Webhooks don't require JWT auth (they use signature verification)

  /**
   * POST /api/v1/webhooks/razorpay
   * Razorpay webhook handler
   */
  app.post(
    '/webhooks/razorpay',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        // Get raw body and signature
        const rawBody = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
        const signature = request.headers['x-razorpay-signature'] as string;

        if (!signature) {
          sendError(reply, 'UNAUTHORIZED', 'Missing x-razorpay-signature header', 401);
          return;
        }

        // Parse payload
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid JSON payload', 400);
          return;
        }

        const supabase = getSupabaseClient();
        const result = await processRazorpayWebhook(
          supabase,
          payload as { event: string; payload: Record<string, unknown> },
          signature
        );

        // Always return 200 OK (Razorpay expects this)
        sendSuccess(reply, result);
      } catch (error) {
        request.log.error(error, 'Failed to process Razorpay webhook');

        // Still return 200 OK to prevent Razorpay retries
        // (we've stored the event, can process later)
        sendSuccess(reply, {
          received: true,
          stored: false,
          processed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
