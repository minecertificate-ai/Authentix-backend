/**
 * ORGANIZATIONS API
 *
 * RESTful API endpoints for organization management.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authMiddleware } from '../../lib/auth/middleware.js';
import { contextMiddleware } from '../../lib/middleware/context.js';
import { OrganizationRepository } from '../../domains/organizations/repository.js';
import { OrganizationService } from '../../domains/organizations/service.js';
import { updateOrganizationSchema } from '../../domains/organizations/types.js';
import { sendSuccess, sendError } from '../../lib/utils/response.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

/**
 * Register organization routes
 */
export async function registerOrganizationRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', contextMiddleware);

  /**
   * GET /api/v1/organizations/me
   * Get current user's organization
   */
  app.get(
    '/organizations/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new OrganizationRepository(getSupabaseClient());
        const service = new OrganizationService(repository);
        const supabase = getSupabaseClient();

        const organization = await service.getById(request.context!.organizationId);

        // Fetch industry name if industry_id exists
        let industryName: string | null = null;
        if (organization.industry_id) {
          const { data: industryData } = await supabase
            .from('industries')
            .select('name')
            .eq('id', organization.industry_id)
            .maybeSingle();
          
          industryName = industryData?.name || null;
        }

        // Fetch logo file info if logo_file_id exists
        let logoUrl: string | null = null;
        let logoBucket: string | null = null;
        let logoPath: string | null = null;
        if (organization.logo_file_id) {
          const { data: logoData } = await supabase
            .from('files')
            .select('bucket, path')
            .eq('id', organization.logo_file_id)
            .maybeSingle();
          
          if (logoData) {
            logoBucket = logoData.bucket;
            logoPath = logoData.path;
            // Generate signed URL for logo
            const { data: urlData } = supabase.storage
              .from(logoData.bucket)
              .getPublicUrl(logoData.path);
            logoUrl = urlData.publicUrl;
          }
        }

        // Transform to frontend-compatible format
        const response = {
          id: organization.id,
          name: organization.name,
          email: organization.email,
          phone: organization.phone,
          website: organization.website_url,
          industry: industryName,
          industry_id: organization.industry_id,
          address: organization.address_line1 
            ? [organization.address_line1, organization.address_line2].filter(Boolean).join(', ')
            : null,
          city: organization.city,
          state: organization.state_province,
          country: organization.country,
          postal_code: organization.postal_code,
          gst_number: organization.gstin,
          cin_number: null, // Not in organizations table
          logo_file_id: organization.logo_file_id,
          logo_bucket: logoBucket,
          logo_path: logoPath,
          logo_url: logoUrl,
          logo: logoBucket && logoPath ? { bucket: logoBucket, path: logoPath } : null,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
        };

        sendSuccess(reply, response);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sendError(reply, 'NOT_FOUND', error.message, 404);
        } else {
          request.log.error(error, 'Failed to get organization');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to get organization', 500);
        }
      }
    }
  );

  /**
   * PUT /api/v1/organizations/me
   * Update current user's organization
   */
  app.put(
    '/organizations/me',
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
            sendError(reply, 'VALIDATION_ERROR', 'Organization data is required', 400);
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

        const supabase = getSupabaseClient();

        // Transform frontend format to backend format
        const backendDto: {
          name?: string;
          email?: string | null;
          phone?: string | null;
          website_url?: string | null;
          industry_id?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state_province?: string | null;
          country?: string | null;
          postal_code?: string | null;
          tax_id?: string | null;
          gstin?: string | null;
          logo_file_id?: string | null;
        } = {};

        if (dto.name !== undefined) backendDto.name = dto.name;
        if (dto.email !== undefined) backendDto.email = dto.email;
        if (dto.phone !== undefined) backendDto.phone = dto.phone;
        if (dto.website !== undefined) backendDto.website_url = dto.website;
        // Handle industry - prefer industry_id (UUID), fallback to looking up by name
        if (dto.industry_id !== undefined) {
          backendDto.industry_id = dto.industry_id;
        } else if (dto.industry !== undefined && dto.industry) {
          // Look up industry_id by name
          const { data: industryData } = await supabase
            .from('industries')
            .select('id')
            .eq('name', dto.industry)
            .maybeSingle();
          backendDto.industry_id = industryData?.id || null;
        }
        // Handle address - split combined address into address_line1 and address_line2
        if (dto.address !== undefined) {
          if (dto.address) {
            const addressParts = dto.address.split(',').map(s => s.trim());
            backendDto.address_line1 = addressParts[0] || null;
            backendDto.address_line2 = addressParts.slice(1).join(', ') || null;
          } else {
            backendDto.address_line1 = null;
            backendDto.address_line2 = null;
          }
        }
        if (dto.city !== undefined) backendDto.city = dto.city;
        if (dto.state !== undefined) backendDto.state_province = dto.state;
        if (dto.country !== undefined) backendDto.country = dto.country;
        if (dto.postal_code !== undefined) backendDto.postal_code = dto.postal_code;
        if (dto.gst_number !== undefined) backendDto.gstin = dto.gst_number;
        // cin_number is not in organizations table, so we ignore it
        if (dto.logo_file_id !== undefined) backendDto.logo_file_id = dto.logo_file_id;

        const validatedDto = updateOrganizationSchema.parse(backendDto);

        const repository = new OrganizationRepository(getSupabaseClient());
        const service = new OrganizationService(repository);

        const organization = await service.update(request.context!.organizationId, validatedDto, logoFile);

        // Transform response to frontend-compatible format (same as GET)
        // Fetch industry name if industry_id exists
        let industryName: string | null = null;
        if (organization.industry_id) {
          const { data: industryData } = await supabase
            .from('industries')
            .select('name')
            .eq('id', organization.industry_id)
            .maybeSingle();
          
          industryName = industryData?.name || null;
        }

        // Fetch logo file info if logo_file_id exists
        let logoUrl: string | null = null;
        let logoBucket: string | null = null;
        let logoPath: string | null = null;
        if (organization.logo_file_id) {
          const { data: logoData } = await supabase
            .from('files')
            .select('bucket, path')
            .eq('id', organization.logo_file_id)
            .maybeSingle();
          
          if (logoData) {
            logoBucket = logoData.bucket;
            logoPath = logoData.path;
            const { data: urlData } = supabase.storage
              .from(logoData.bucket)
              .getPublicUrl(logoData.path);
            logoUrl = urlData.publicUrl;
          }
        }

        // Transform to frontend-compatible format
        const response = {
          id: organization.id,
          name: organization.name,
          email: organization.email,
          phone: organization.phone,
          website: organization.website_url,
          industry: industryName,
          industry_id: organization.industry_id,
          address: organization.address_line1 
            ? [organization.address_line1, organization.address_line2].filter(Boolean).join(', ')
            : null,
          city: organization.city,
          state: organization.state_province,
          country: organization.country,
          postal_code: organization.postal_code,
          gst_number: organization.gstin,
          cin_number: null,
          logo_file_id: organization.logo_file_id,
          logo_bucket: logoBucket,
          logo_path: logoPath,
          logo_url: logoUrl,
          logo: logoBucket && logoPath ? { bucket: logoBucket, path: logoPath } : null,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
        };

        sendSuccess(reply, response);
      } catch (error) {
        if (error instanceof ValidationError) {
          sendError(reply, 'VALIDATION_ERROR', error.message, 400, error.details);
        } else if (error instanceof Error && error.name === 'ZodError') {
          sendError(reply, 'VALIDATION_ERROR', 'Invalid request data', 400);
        } else {
          request.log.error(error, 'Failed to update organization');
          sendError(reply, 'INTERNAL_ERROR', 'Failed to update organization', 500);
        }
      }
    }
  );

  /**
   * GET /api/v1/organizations/me/api-settings
   * Get API settings for current organization
   */
  app.get(
    '/organizations/me/api-settings',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new OrganizationRepository(getSupabaseClient());
        const service = new OrganizationService(repository);

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
   * POST /api/v1/organizations/me/bootstrap-identity
   * Bootstrap or regenerate organization identity (application_id and API key)
   */
  app.post(
    '/organizations/me/bootstrap-identity',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new OrganizationRepository(getSupabaseClient());
        const service = new OrganizationService(repository);

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
   * POST /api/v1/organizations/me/rotate-api-key
   * Rotate API key (keep application_id)
   */
  app.post(
    '/organizations/me/rotate-api-key',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const repository = new OrganizationRepository(getSupabaseClient());
        const service = new OrganizationService(repository);

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
