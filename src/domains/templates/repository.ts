/**
 * TEMPLATE REPOSITORY
 *
 * Data access layer for certificate templates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemplateEntity, CreateTemplateDTO, UpdateTemplateDTO, TemplateFileType, TemplateStatus, CertificateField } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class TemplateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Find template by ID
   */
  async findById(id: string, organizationId: string): Promise<TemplateEntity | null> {
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find template: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  /**
   * Find all templates for organization
   */
  async findAll(
    organizationId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ data: TemplateEntity[]; count: number }> {
    let query = this.supabase
      .from('certificate_templates')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.sortBy) {
      query = query.order(options.sortBy, {
        ascending: options.sortOrder === 'asc',
      });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to find templates: ${error.message}`);
    }

    return {
      data: (data ?? []).map((item) => this.mapToEntity(item)),
      count: count ?? 0,
    };
  }

  /**
   * Create template
   */
  async create(
    organizationId: string,
    userId: string,
    dto: CreateTemplateDTO,
    storagePath: string,
    previewUrl: string | null
  ): Promise<TemplateEntity> {
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .insert({
        organization_id: organizationId,
        name: dto.name,
        description: dto.description ?? null,
        file_type: dto.file_type,
        storage_path: storagePath,
        preview_url: previewUrl,
        status: dto.status ?? 'active',
        fields: dto.fields,
        width: dto.width ?? null,
        height: dto.height ?? null,
        certificate_category: dto.certificate_category ?? null,
        certificate_subcategory: dto.certificate_subcategory ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create template: ${error.message}`);
    }

    return this.mapToEntity(data);
  }

  /**
   * Update template
   */
  async update(
    id: string,
    organizationId: string,
    dto: UpdateTemplateDTO
  ): Promise<TemplateEntity> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.fields !== undefined) updateData.fields = dto.fields;
    if (dto.width !== undefined) updateData.width = dto.width;
    if (dto.height !== undefined) updateData.height = dto.height;

    const { data, error } = await this.supabase
      .from('certificate_templates')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Template not found');
    }

    return this.mapToEntity(data);
  }

  /**
   * Soft delete template
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('certificate_templates')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'archived',
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Get certificate categories for organization
   */
  async getCategories(organizationId: string, industry: string | null): Promise<Array<{
    certificate_category: string;
    certificate_subcategory: string;
  }>> {
    let query = this.supabase
      .from('certificate_categories')
      .select('certificate_category, certificate_subcategory')
      .is('deleted_at', null);

    // Filter by industry if provided
    if (industry) {
      query = query.eq('industry', industry);
    }

    // Get organization-specific and system-wide categories
    query = query.or(`organization_id.is.null,organization_id.eq.${organizationId}`);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    return (data ?? []) as Array<{
      certificate_category: string;
      certificate_subcategory: string;
    }>;
  }

  /**
   * Get organization industry
   */
  async getOrganizationIndustry(organizationId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('industry_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch organization: ${error.message}`);
    }

    return data ? (data.industry_id as string | null) : null;
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: Record<string, unknown>): TemplateEntity {
    return {
      id: row.id as string,
      organization_id: row.organization_id as string,
      name: row.name as string,
      description: row.description as string | null,
      file_type: row.file_type as TemplateFileType,
      storage_path: row.storage_path as string,
      preview_url: row.preview_url as string | null,
      status: (row.status as TemplateStatus) ?? 'draft',
      fields: (row.fields as CertificateField[]) ?? [],
      width: row.width as number | null,
      height: row.height as number | null,
      certificate_category: row.certificate_category as string | null,
      certificate_subcategory: row.certificate_subcategory as string | null,
      created_by: row.created_by as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      deleted_at: row.deleted_at as string | null,
    };
  }
}
