/**
 * COMPANY REPOSITORY
 *
 * Data access layer for company management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyEntity, UpdateCompanyDTO, CompanyAPISettings } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class CompanyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get company by ID
   */
  async findById(id: string): Promise<CompanyEntity | null> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find company: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  /**
   * Update company
   */
  async update(id: string, dto: UpdateCompanyDTO): Promise<CompanyEntity> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    Object.keys(dto).forEach((key) => {
      const value = dto[key as keyof UpdateCompanyDTO];
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    const { data, error } = await this.supabase
      .from('companies')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update company: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Company not found');
    }

    return this.mapToEntity(data);
  }

  /**
   * Get API settings
   */
  async getAPISettings(id: string): Promise<CompanyAPISettings> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('application_id, api_enabled, api_key_hash, api_key_created_at, api_key_last_rotated_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get API settings: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Company not found');
    }

    return {
      application_id: data.application_id,
      api_enabled: data.api_enabled || false,
      api_key_exists: !!data.api_key_hash,
      api_key_created_at: data.api_key_created_at,
      api_key_last_rotated_at: data.api_key_last_rotated_at,
    };
  }

  /**
   * Update API enabled status
   */
  async updateAPIEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('companies')
      .update({ api_enabled: enabled })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to update API status: ${error.message}`);
    }
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: Record<string, unknown>): CompanyEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string | null,
      phone: row.phone as string | null,
      website: row.website as string | null,
      industry: row.industry as string | null,
      address: row.address as string | null,
      city: row.city as string | null,
      state: row.state as string | null,
      country: row.country as string | null,
      postal_code: row.postal_code as string | null,
      gst_number: row.gst_number as string | null,
      cin_number: row.cin_number as string | null,
      logo: row.logo as string | null,
      application_id: row.application_id as string,
      api_enabled: (row.api_enabled as boolean) || false,
      api_key_created_at: row.api_key_created_at as string | null,
      api_key_last_rotated_at: row.api_key_last_rotated_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
