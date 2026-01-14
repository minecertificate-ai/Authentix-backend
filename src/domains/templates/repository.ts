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

  /**
   * Create template using new schema (certificate_templates, certificate_template_versions, files)
   */
  async createWithNewSchema(
    organizationId: string,
    userId: string,
    dto: {
      title: string;
      category_id: string;
      subcategory_id: string;
    }
  ): Promise<{ template_id: string }> {
    // Create template record first (status draft, latest_version_id NULL)
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .insert({
        organization_id: organizationId,
        category_id: dto.category_id,
        subcategory_id: dto.subcategory_id,
        title: dto.title,
        status: 'draft',
        created_by_user_id: userId,
      } as any)
      .select('id')
      .single();

    if (error) {
      throw new Error(`[TemplateRepository.createWithNewSchema] Failed to create template: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return { template_id: data.id };
  }

  /**
   * Create file registry entry
   */
  async createFileEntry(
    organizationId: string,
    userId: string,
    fileData: {
      bucket: string;
      path: string;
      kind: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      checksum_sha256: string | null;
    }
  ): Promise<{ file_id: string }> {
    const { data, error } = await this.supabase
      .from('files')
      .insert({
        organization_id: organizationId,
        bucket: fileData.bucket,
        path: fileData.path,
        kind: fileData.kind,
        original_name: fileData.original_name,
        mime_type: fileData.mime_type,
        size_bytes: fileData.size_bytes,
        checksum_sha256: fileData.checksum_sha256,
        created_by_user_id: userId,
      } as any)
      .select('id')
      .single();

    if (error) {
      throw new Error(`[TemplateRepository.createFileEntry] Failed to create file entry: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return { file_id: data.id };
  }

  /**
   * Create template version
   */
  async createTemplateVersion(
    templateId: string,
    versionData: {
      version_number: number;
      source_file_id: string;
      page_count: number;
      normalized_pages: Record<string, unknown> | null;
      preview_file_id: string | null;
    }
  ): Promise<{ version_id: string }> {
    const { data, error } = await this.supabase
      .from('certificate_template_versions')
      .insert({
        template_id: templateId,
        version_number: versionData.version_number,
        source_file_id: versionData.source_file_id,
        page_count: versionData.page_count,
        normalized_pages: versionData.normalized_pages,
        preview_file_id: versionData.preview_file_id,
      } as any)
      .select('id')
      .single();

    if (error) {
      throw new Error(`[TemplateRepository.createTemplateVersion] Failed to create template version: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return { version_id: data.id };
  }

  /**
   * Update template latest_version_id
   */
  async updateLatestVersion(templateId: string, versionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('certificate_templates')
      .update({ latest_version_id: versionId } as any)
      .eq('id', templateId);

    if (error) {
      throw new Error(`[TemplateRepository.updateLatestVersion] Failed to update latest version: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }
  }

  /**
   * Delete template (cleanup on failure)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .from('certificate_templates')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', templateId);

    if (error) {
      // Log but don't throw - cleanup failures shouldn't break the flow
      console.error(`[TemplateRepository.deleteTemplate] Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Mark file as deleted (cleanup on failure)
   */
  async deleteFile(fileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('files')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', fileId);

    if (error) {
      console.error(`[TemplateRepository.deleteFile] Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get template with latest version, files, and fields for editor
   * Uses 2 queries max: (template+version+files) + (fields) to avoid N+1
   */
  async getTemplateForEditor(
    templateId: string,
    organizationId: string
  ): Promise<{
    template: any;
    version: any;
    source_file: any;
    preview_file: any | null;
    fields: any[];
  } | null> {
    // Query 1: Template with latest version and files
    const { data: templateData, error: templateError } = await this.supabase
      .from('certificate_templates')
      .select(`
        id,
        title,
        status,
        category_id,
        subcategory_id,
        created_at,
        latest_version_id
      `)
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (templateError) {
      throw new Error(`[TemplateRepository.getTemplateForEditor] Failed to fetch template: ${templateError.message} (PostgREST code: ${templateError.code || 'unknown'})`);
    }

    if (!templateData) {
      return null;
    }

    if (!templateData.latest_version_id) {
      // Template exists but no version yet
      return {
        template: {
          id: templateData.id,
          title: templateData.title,
          status: templateData.status,
          category_id: templateData.category_id,
          subcategory_id: templateData.subcategory_id,
          created_at: templateData.created_at,
        },
        version: null,
        source_file: null,
        preview_file: null,
        fields: [],
      };
    }

    // Query version with files
    const { data: versionData, error: versionError } = await this.supabase
      .from('certificate_template_versions')
      .select(`
        id,
        version_number,
        page_count,
        normalized_pages,
        source_file_id,
        preview_file_id,
        source_file:source_file_id (
          id,
          bucket,
          path,
          mime_type
        ),
        preview_file:preview_file_id (
          id,
          bucket,
          path
        )
      `)
      .eq('id', templateData.latest_version_id)
      .eq('template_id', templateId)
      .maybeSingle();

    if (versionError) {
      throw new Error(`[TemplateRepository.getTemplateForEditor] Failed to fetch version: ${versionError.message} (PostgREST code: ${versionError.code || 'unknown'})`);
    }

    if (!versionData) {
      return {
        template: {
          id: templateData.id,
          title: templateData.title,
          status: templateData.status,
          category_id: templateData.category_id,
          subcategory_id: templateData.subcategory_id,
          created_at: templateData.created_at,
        },
        version: null,
        source_file: null,
        preview_file: null,
        fields: [],
      };
    }

    const sourceFile = (versionData as any).source_file;
    const previewFile = (versionData as any).preview_file || null;

    // Query 2: Fetch fields (single query for all fields)
    const { data: fieldsData, error: fieldsError } = await this.supabase
      .from('certificate_template_fields')
      .select('id, field_key, label, type, page_number, x, y, width, height, style, required')
      .eq('template_version_id', versionData.id)
      .order('created_at', { ascending: true });

    if (fieldsError) {
      throw new Error(`[TemplateRepository.getTemplateForEditor] Failed to fetch fields: ${fieldsError.message} (PostgREST code: ${fieldsError.code || 'unknown'})`);
    }

    return {
      template: {
        id: templateData.id,
        title: templateData.title,
        status: templateData.status,
        category_id: templateData.category_id,
        subcategory_id: templateData.subcategory_id,
        created_at: templateData.created_at,
      },
      version: {
        id: versionData.id,
        version_number: versionData.version_number,
        page_count: versionData.page_count,
        normalized_pages: versionData.normalized_pages,
      },
      source_file: sourceFile ? {
        id: sourceFile.id,
        bucket: sourceFile.bucket,
        path: sourceFile.path,
        mime_type: sourceFile.mime_type,
      } : null,
      preview_file: previewFile ? {
        id: previewFile.id,
        bucket: previewFile.bucket,
        path: previewFile.path,
      } : null,
      fields: (fieldsData ?? []).map((field: any) => ({
        id: field.id,
        field_key: field.field_key,
        label: field.label,
        type: field.type,
        page_number: field.page_number,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        style: field.style,
        required: field.required,
      })),
    };
  }

  /**
   * Validate template belongs to organization and version belongs to template
   */
  async validateTemplateAndVersion(
    templateId: string,
    versionId: string,
    organizationId: string
  ): Promise<{ template: any; version: any }> {
    // Query template and version in one go
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .select(`
        id,
        organization_id,
        certificate_template_versions!inner (
          id,
          template_id,
          page_count
        )
      `)
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .eq('certificate_template_versions.id', versionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[TemplateRepository.validateTemplateAndVersion] Failed to validate: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    if (!data) {
      return { template: null, version: null };
    }

    const version = (data as any).certificate_template_versions;
    if (!version || Array.isArray(version) || version.template_id !== templateId) {
      return { template: null, version: null };
    }

    return {
      template: {
        id: data.id,
        organization_id: data.organization_id,
      },
      version: {
        id: version.id,
        template_id: version.template_id,
        page_count: version.page_count,
      },
    };
  }

  /**
   * Replace all fields for a template version (delete + bulk insert)
   * This should be called within a transaction for atomicity
   */
  async replaceFields(
    templateVersionId: string,
    fields: Array<{
      field_key: string;
      label: string;
      type: string;
      page_number: number;
      x: number;
      y: number;
      width?: number | null;
      height?: number | null;
      style?: Record<string, unknown> | null;
      required: boolean;
    }>
  ): Promise<Array<{ id: string; field_key: string; label: string; type: string; page_number: number; x: number; y: number; width: number | null; height: number | null; style: Record<string, unknown> | null; required: boolean }>> {
    // Step 1: Delete existing fields
    const { error: deleteError } = await this.supabase
      .from('certificate_template_fields')
      .delete()
      .eq('template_version_id', templateVersionId);

    if (deleteError) {
      throw new Error(`[TemplateRepository.replaceFields] Failed to delete existing fields: ${deleteError.message} (PostgREST code: ${deleteError.code || 'unknown'})`);
    }

    // Step 2: Insert new fields (if any)
    if (fields.length === 0) {
      return [];
    }

    const fieldsToInsert = fields.map(field => ({
      template_version_id: templateVersionId,
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      page_number: field.page_number,
      x: field.x,
      y: field.y,
      width: field.width ?? null,
      height: field.height ?? null,
      style: field.style ?? null,
      required: field.required,
    }));

    const { data: insertedFields, error: insertError } = await this.supabase
      .from('certificate_template_fields')
      .insert(fieldsToInsert as any)
      .select('id, field_key, label, type, page_number, x, y, width, height, style, required');

    if (insertError) {
      throw new Error(`[TemplateRepository.replaceFields] Failed to insert fields: ${insertError.message} (PostgREST code: ${insertError.code || 'unknown'})`);
    }

    return (insertedFields ?? []).map((field: any) => ({
      id: field.id,
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      page_number: field.page_number,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      style: field.style,
      required: field.required,
    }));
  }

  /**
   * Get version with source file info for preview generation
   */
  async getVersionForPreview(versionId: string): Promise<{
    version: any;
    source_file: any;
    template: any;
  } | null> {
    const { data, error } = await this.supabase
      .from('certificate_template_versions')
      .select(`
        id,
        template_id,
        version_number,
        preview_file_id,
        source_file_id,
        source_file:source_file_id (
          id,
          bucket,
          path,
          mime_type
        ),
        certificate_templates!inner (
          id,
          organization_id
        )
      `)
      .eq('id', versionId)
      .maybeSingle();

    if (error) {
      throw new Error(`[TemplateRepository.getVersionForPreview] Failed to fetch version: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    if (!data) {
      return null;
    }

    const template = (data as any).certificate_templates;
    const sourceFile = (data as any).source_file;

    return {
      version: {
        id: data.id,
        template_id: data.template_id,
        version_number: data.version_number,
        preview_file_id: data.preview_file_id,
      },
      source_file: sourceFile,
      template: template ? {
        id: template.id,
        organization_id: template.organization_id,
      } : null,
    };
  }

  /**
   * Update version preview_file_id
   */
  async updatePreviewFileId(versionId: string, previewFileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('certificate_template_versions')
      .update({ preview_file_id: previewFileId } as any)
      .eq('id', versionId);

    if (error) {
      throw new Error(`[TemplateRepository.updatePreviewFileId] Failed to update preview_file_id: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }
  }
}
