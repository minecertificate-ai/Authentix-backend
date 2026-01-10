/**
 * COMPANY SERVICE
 *
 * Business logic layer for company management.
 */

import type { CompanyRepository } from './repository.js';
import type { CompanyEntity, UpdateCompanyDTO, CompanyAPISettings } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { generateApplicationId, generateAPIKey, hashAPIKey } from '../../lib/utils/ids.js';

export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  /**
   * Get company by ID
   */
  async getById(id: string): Promise<CompanyEntity> {
    const company = await this.repository.findById(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    return company;
  }

  /**
   * Update company
   */
  async update(id: string, dto: UpdateCompanyDTO, logoFile?: { buffer: Buffer; mimetype: string; originalname: string }): Promise<CompanyEntity> {
    // If logo file is provided, upload it
    if (logoFile) {
      const supabase = getSupabaseClient();
      const company = await this.repository.findById(id);
      if (!company) {
        throw new NotFoundError('Company not found');
      }

      const folderId = company.application_id || id;
      const fileExt = logoFile.originalname.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `company-logos/${folderId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('minecertificate')
        .upload(filePath, logoFile.buffer, {
          contentType: logoFile.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload logo: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('minecertificate')
        .getPublicUrl(filePath);

      dto.logo = urlData.publicUrl;
    }

    return this.repository.update(id, dto);
  }

  /**
   * Get API settings
   */
  async getAPISettings(id: string): Promise<CompanyAPISettings> {
    return this.repository.getAPISettings(id);
  }

  /**
   * Update API enabled status
   */
  async updateAPIEnabled(id: string, enabled: boolean): Promise<void> {
    await this.repository.updateAPIEnabled(id, enabled);
  }

  /**
   * Bootstrap company identity (generate application_id and API key)
   */
  async bootstrapIdentity(companyId: string, userId: string): Promise<{ application_id: string; api_key: string }> {
    // Verify user is admin
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      throw new NotFoundError('User not found');
    }

    const userRole = (userData as { role: string }).role;
    if (userRole !== 'admin') {
      throw new Error('Admin access required');
    }

    // Generate new identifiers
    const newApplicationId = generateApplicationId();
    const newAPIKey = generateAPIKey();
    const apiKeyHash = await hashAPIKey(newAPIKey);

    // Update company with application_id and API key hash using Supabase directly
    // Use type assertion to bypass strict typing for these internal fields
    const updateData = {
      application_id: newApplicationId,
      api_key_hash: apiKeyHash,
      api_enabled: true,
      api_key_created_at: new Date().toISOString(),
      api_key_last_rotated_at: new Date().toISOString(),
    };
    const { error: updateError } = await (supabase
      .from('companies') as any)
      .update(updateData)
      .eq('id', companyId);

    if (updateError) {
      throw new Error(`Failed to update company identity: ${updateError.message}`);
    }

    return {
      application_id: newApplicationId,
      api_key: newAPIKey,
    };
  }

  /**
   * Rotate API key (keep application_id)
   */
  async rotateAPIKey(companyId: string): Promise<{ application_id: string; api_key: string }> {
    // Get current application_id
    const company = await this.repository.findById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Generate new API key
    const newAPIKey = generateAPIKey();
    const apiKeyHash = await hashAPIKey(newAPIKey);

    // Update API key hash using Supabase directly
    const supabase = getSupabaseClient();
    const updateData = {
      api_key_hash: apiKeyHash,
      api_enabled: true,
      api_key_last_rotated_at: new Date().toISOString(),
    };
    const { error: updateError } = await (supabase
      .from('companies') as any)
      .update(updateData)
      .eq('id', companyId);

    if (updateError) {
      throw new Error(`Failed to rotate API key: ${updateError.message}`);
    }

    return {
      application_id: company.application_id,
      api_key: newAPIKey,
    };
  }
}
