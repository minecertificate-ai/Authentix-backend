/**
 * ORGANIZATION REPOSITORY
 *
 * Data access layer for organization management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationEntity, UpdateOrganizationDTO, OrganizationAPISettings } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class OrganizationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get organization by ID
   */
  async findById(id: string): Promise<OrganizationEntity | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find organization: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  /**
   * Update organization
   */
  async update(id: string, dto: UpdateOrganizationDTO): Promise<OrganizationEntity> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    Object.keys(dto).forEach((key) => {
      const value = dto[key as keyof UpdateOrganizationDTO];
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    const { data, error } = await this.supabase
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update organization: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Organization not found');
    }

    return this.mapToEntity(data);
  }

  /**
   * Get API settings
   */
  async getAPISettings(id: string): Promise<OrganizationAPISettings> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('application_id, api_key_hash, created_at, updated_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get API settings: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Organization not found');
    }

    return {
      application_id: data.application_id,
      api_key_exists: !!data.api_key_hash,
      api_key_created_at: data.created_at,
      api_key_last_rotated_at: data.updated_at,
    };
  }

  /**
   * Update API key rotation timestamp
   */
  async updateAPIKeyRotatedAt(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('organizations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to update API key rotation timestamp: ${error.message}`);
    }
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: Record<string, unknown>): OrganizationEntity {
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      legal_name: row.legal_name as string | null,
      email: row.email as string | null,
      phone: row.phone as string | null,
      website_url: row.website_url as string | null,
      industry_id: row.industry_id as string | null,
      address_line1: row.address_line1 as string | null,
      address_line2: row.address_line2 as string | null,
      city: row.city as string | null,
      state_province: row.state_province as string | null,
      postal_code: row.postal_code as string | null,
      country: row.country as string | null,
      tax_id: row.tax_id as string | null,
      gstin: row.gstin as string | null,
      logo_file_id: row.logo_file_id as string | null,
      application_id: row.application_id as string,
      api_key_hash: row.api_key_hash as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
