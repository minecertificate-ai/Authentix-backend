/**
 * ORGANIZATION SERVICE
 *
 * Business logic layer for organization management.
 */

import type { OrganizationRepository } from './repository.js';
import type { OrganizationEntity, UpdateOrganizationDTO, OrganizationAPISettings } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { generateApplicationId, generateAPIKey, hashAPIKey } from '../../lib/utils/ids.js';

export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  /**
   * Get organization by ID
   */
  async getById(id: string): Promise<OrganizationEntity> {
    const organization = await this.repository.findById(id);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    return organization;
  }

  /**
   * Update organization
   */
  async update(id: string, dto: UpdateOrganizationDTO, logoFile?: { buffer: Buffer; mimetype: string; originalname: string }): Promise<OrganizationEntity> {
    // If logo file is provided, upload it
    if (logoFile) {
      const supabase = getSupabaseClient();
      const organization = await this.repository.findById(id);
      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const folderId = organization.application_id || id;
      const fileExt = logoFile.originalname.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `org_branding/${folderId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('authentix')
        .upload(filePath, logoFile.buffer, {
          contentType: logoFile.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload logo: ${uploadError.message}`);
      }

      // Create file record
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .insert({
          bucket: 'authentix',
          path: filePath,
          kind: 'org_logo',
          original_name: logoFile.originalname,
          mime_type: logoFile.mimetype,
          size_bytes: logoFile.buffer.length,
          organization_id: id,
        })
        .select('id')
        .single();

      if (fileError || !fileData) {
        throw new Error(`Failed to create file record: ${fileError?.message || 'Unknown error'}`);
      }

      dto.logo_file_id = fileData.id;
    }

    return this.repository.update(id, dto);
  }

  /**
   * Get API settings
   */
  async getAPISettings(id: string): Promise<OrganizationAPISettings> {
    return this.repository.getAPISettings(id);
  }

  /**
   * Bootstrap organization identity (generate application_id and API key)
   */
  async bootstrapIdentity(organizationId: string, userId: string): Promise<{ application_id: string; api_key: string }> {
    // Generate new identifiers
    const newApplicationId = generateApplicationId();
    const newAPIKey = generateAPIKey();
    const apiKeyHash = await hashAPIKey(newAPIKey);

    // Update organization with application_id and API key hash using Supabase directly
    const supabase = getSupabaseClient();
    const updateData = {
      application_id: newApplicationId,
      api_key_hash: apiKeyHash,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)
      .is('deleted_at', null);

    if (updateError) {
      throw new Error(`Failed to update organization identity: ${updateError.message}`);
    }

    return {
      application_id: newApplicationId,
      api_key: newAPIKey,
    };
  }

  /**
   * Rotate API key (keep application_id)
   */
  async rotateAPIKey(organizationId: string): Promise<{ application_id: string; api_key: string }> {
    // Get current application_id
    const organization = await this.repository.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Generate new API key
    const newAPIKey = generateAPIKey();
    const apiKeyHash = await hashAPIKey(newAPIKey);

    // Update API key hash using Supabase directly
    const supabase = getSupabaseClient();
    const updateData = {
      api_key_hash: apiKeyHash,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)
      .is('deleted_at', null);

    if (updateError) {
      throw new Error(`Failed to rotate API key: ${updateError.message}`);
    }

    await this.repository.updateAPIKeyRotatedAt(organizationId);

    return {
      application_id: organization.application_id,
      api_key: newAPIKey,
    };
  }
}
