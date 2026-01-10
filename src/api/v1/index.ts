/**
 * API V1 ROUTES
 *
 * All API routes are versioned under /api/v1
 */

import type { FastifyInstance } from 'fastify';
import { registerTemplateRoutes } from './templates.js';
import { registerCertificateRoutes } from './certificates.js';
import { registerImportRoutes } from './imports.js';
import { registerBillingRoutes } from './billing.js';
import { registerVerificationRoutes } from './verification.js';
import { registerWebhookRoutes } from './webhooks.js';

export async function registerV1Routes(app: FastifyInstance): Promise<void> {
  // Register domain routes
  await app.register(registerTemplateRoutes);
  await app.register(registerCertificateRoutes);
  await app.register(registerImportRoutes);
  await app.register(registerBillingRoutes);
  await app.register(registerVerificationRoutes);
  await app.register(registerWebhookRoutes);
}
