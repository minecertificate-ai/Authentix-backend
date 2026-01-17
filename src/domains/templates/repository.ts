/**
 * TEMPLATE REPOSITORY
 *
 * Data access layer for certificate templates.
 *
 * SOFT DELETE PATTERN:
 * - Templates are never physically deleted from the database
 * - When deleted, `deleted_at` is set to a timestamp
 * - All queries use `.is('deleted_at', null)` to filter out deleted templates
 * - This allows for data recovery and audit trails
 * - Only non-deleted templates are returned to users
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemplateEntity, CreateTemplateDTO, UpdateTemplateDTO, TemplateFileType, CertificateField } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class TemplateRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Find template by ID
   */
  async findById(id: string, organizationId: string): Promise<TemplateEntity | null> {
    console.log('[TemplateRepository.findById] Executing DB query', {
      template_id: id,
      organizationId,
    });

    // Soft delete pattern: .is('deleted_at', null) filters out deleted templates
    // deleted_at is set to a timestamp when template is soft-deleted
    // Join latest version + files to support preview URL generation
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .select(`
        id,
        organization_id,
        title,
        category_id,
        subcategory_id,
        latest_version_id,
        created_by_user_id,
        created_at,
        updated_at,
        deleted_at,
        category:certificate_categories!certificate_templates_category_id_fkey (
          id,
          name
        ),
        subcategory:certificate_subcategories!certificate_templates_subcategory_id_fkey (
          id,
          name
        ),
        latest_version:certificate_template_versions!fk_templates_latest_version (
          id,
          preview_file_id,
          source_file_id,
          preview_file:preview_file_id (
            id,
            bucket,
            path
          ),
          source_file:source_file_id (
            id,
            bucket,
            path,
            mime_type
          )
        )
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null) // Only return non-deleted templates
      .maybeSingle();

    if (error) {
      console.error('[TemplateRepository.findById] DB query error', {
        template_id: id,
        organizationId,
        error: error.message,
        error_code: error.code,
      });
      throw new Error(`Failed to find template: ${error.message}`);
    }

    const result = data ? this.mapNewSchemaToEntity(data) : null;

    console.log('[TemplateRepository.findById] DB query successful', {
      template_id: id,
      organizationId,
      found: !!result,
      template: result ? {
        id: result.id,
        name: result.name,
      } : null,
    });

    return result;
  }

  /**
   * Find all templates for organization
   */
  async findAll(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ data: TemplateEntity[]; count: number }> {
    console.log('[TemplateRepository.findAll] Executing DB query', {
      organizationId,
      options,
    });

    // Select new schema columns and join with categories/subcategories for names
    // Also join with latest version and preview file
    // Note: Status filtering removed - all templates are active and ready to use
    let query = this.supabase
      .from('certificate_templates')
      .select(`
        id,
        organization_id,
        title,
        category_id,
        subcategory_id,
        latest_version_id,
        created_by_user_id,
        created_at,
        updated_at,
        deleted_at,
        category:certificate_categories!certificate_templates_category_id_fkey (
          id,
          name
        ),
        subcategory:certificate_subcategories!certificate_templates_subcategory_id_fkey (
          id,
          name
        ),
        latest_version:certificate_template_versions!fk_templates_latest_version (
          id,
          preview_file_id,
          source_file_id,
          preview_file:preview_file_id (
            id,
            bucket,
            path
          ),
          source_file:source_file_id (
            id,
            bucket,
            path,
            mime_type
          )
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null); // Soft delete: only return templates where deleted_at is NULL (not deleted)

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
      console.error('[TemplateRepository.findAll] DB query error', {
        organizationId,
        error: error.message,
        error_code: error.code,
      });
      throw new Error(`Failed to find templates: ${error.message}`);
    }

    // Log raw data to debug preview_file join
    if (data && data.length > 0) {
      console.log('[TemplateRepository.findAll] Raw DB data sample', {
        organizationId,
        first_template_raw: {
          id: data[0]?.id,
          latest_version_id: data[0]?.latest_version_id,
          latest_version: data[0]?.latest_version ? {
            id: data[0].latest_version.id,
            preview_file_id: data[0].latest_version.preview_file_id,
            preview_file: data[0].latest_version.preview_file,
          } : null,
        },
      });
    }

    // Map new schema data to entity format
    const mappedData = (data ?? []).map((item) => this.mapNewSchemaToEntity(item));

    console.log('[TemplateRepository.findAll] DB query successful', {
      organizationId,
      rows_returned: mappedData.length,
      total_count: count ?? 0,
      template_ids: mappedData.map(t => t.id),
      templates_with_preview: mappedData.filter(t => (t as any).preview_file).length,
    });

    return {
      data: mappedData,
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
        // status: removed - all templates are active and ready to use
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
   * Note: In new schema, fields are stored in certificate_template_fields table
   * and dimensions are not stored on template. This method handles legacy updates
   * and ignores fields/dimensions for new schema templates.
   */
  async update(
    id: string,
    organizationId: string,
    dto: UpdateTemplateDTO
  ): Promise<TemplateEntity> {
    // Check if template exists and get its latest_version_id
    const { data: templateData, error: templateCheckError } = await this.supabase
      .from('certificate_templates')
      .select('id, latest_version_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (templateCheckError) {
      throw new Error(`Failed to check template: ${templateCheckError.message}`);
    }

    if (!templateData) {
      throw new NotFoundError('Template not found');
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Only update title if provided (new schema uses title, not name)
    if (dto.name !== undefined) {
      updateData.title = dto.name;
    }

    // Note: In new schema:
    // - fields are stored in certificate_template_fields (use updateFields endpoint)
    // - width/height are not stored on template (they're in the source file metadata)
    // - description is not in new schema
    // We ignore these fields for new schema templates

    // Only update if there's something to update
    if (Object.keys(updateData).length > 1) { // More than just updated_at
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

      // Fetch full template data for response
      return await this.findById(id, organizationId) as TemplateEntity;
    }

    // If nothing to update, just return the template
    return await this.findById(id, organizationId) as TemplateEntity;
  }

  /**
   * Soft delete template
   * Sets deleted_at timestamp to mark template as deleted
   * All queries use .is('deleted_at', null) to filter out deleted templates
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('certificate_templates')
      .update({
        deleted_at: new Date().toISOString(),
        // Note: status removed - templates are always active when not deleted
      } as any)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null); // Only delete if not already deleted

    if (error) {
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Get all file paths for a template (all versions' source and preview files)
   * Returns array of { bucket, path } for storage cleanup
   */
  async getTemplateFilePaths(templateId: string, organizationId: string): Promise<Array<{ bucket: string; path: string }>> {
    // First verify template exists and belongs to organization
    const { data: template, error: templateError } = await this.supabase
      .from('certificate_templates')
      .select('id, organization_id')
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (templateError) {
      throw new Error(`[TemplateRepository.getTemplateFilePaths] Failed to verify template: ${templateError.message} (PostgREST code: ${templateError.code || 'unknown'})`);
    }

    if (!template) {
      throw new Error(`[TemplateRepository.getTemplateFilePaths] Template not found or does not belong to organization`);
    }

    // Get all versions for this template
    const { data: versions, error: versionsError } = await this.supabase
      .from('certificate_template_versions')
      .select(`
        id,
        source_file_id,
        preview_file_id,
        source_file:source_file_id (
          id,
          bucket,
          path
        ),
        preview_file:preview_file_id (
          id,
          bucket,
          path
        )
      `)
      .eq('template_id', templateId);

    if (versionsError) {
      throw new Error(`[TemplateRepository.getTemplateFilePaths] Failed to fetch versions: ${versionsError.message} (PostgREST code: ${versionsError.code || 'unknown'})`);
    }

    const filePaths: Array<{ bucket: string; path: string }> = [];

    // Collect all file paths from all versions
    (versions || []).forEach((version: any) => {
      const sourceFile = version.source_file;
      const previewFile = version.preview_file;

      if (sourceFile && sourceFile.bucket && sourceFile.path) {
        filePaths.push({
          bucket: sourceFile.bucket,
          path: sourceFile.path,
        });
      }

      if (previewFile && previewFile.bucket && previewFile.path) {
        filePaths.push({
          bucket: previewFile.bucket,
          path: previewFile.path,
        });
      }
    });

    return filePaths;
  }

  /**
   * Get certificate categories for organization
   * Returns categories with their subcategories
   */
  async getCategories(organizationId: string, industryId: string | null): Promise<Array<{
    certificate_category: string;
    certificate_subcategory: string;
  }>> {
    // Query categories with subcategories (filter out deleted subcategories)
    let query = this.supabase
      .from('certificate_categories')
      .select(`
        name,
        key,
        subcategories:certificate_subcategories!certificate_subcategories_category_id_fkey (
          name,
          key
        )
      `)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`);
    
    // Note: PostgREST will automatically filter subcategories by deleted_at via RLS

    // Filter by industry_id if provided
    if (industryId) {
      query = query.eq('industry_id', industryId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    // Flatten categories and subcategories into pairs
    const result: Array<{ certificate_category: string; certificate_subcategory: string }> = [];
    
    (data ?? []).forEach((category: any) => {
      const categoryName = category.name || category.key;
      const subcategories = (category.subcategories || []).filter((subcat: any) => !subcat.deleted_at);
      
      if (subcategories.length > 0) {
        subcategories.forEach((subcat: any) => {
          result.push({
            certificate_category: categoryName,
            certificate_subcategory: subcat.name || subcat.key,
          });
        });
      } else {
        // Include category even if no subcategories
        result.push({
          certificate_category: categoryName,
          certificate_subcategory: categoryName,
        });
      }
    });

    return result;
  }

  /**
   * Get organization industry_id
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
   * Map database row to entity (legacy schema)
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
      // status: removed - all templates are active and ready to use
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
   * Map new schema database row to entity
   * New schema has: title, category_id, subcategory_id (not name, certificate_category, etc.)
   */
  private mapNewSchemaToEntity(row: any): TemplateEntity & { title: string; category_id: string; subcategory_id: string; latest_version_id: string | null; category_name?: string | null; subcategory_name?: string | null; preview_file?: { id: string; bucket: string; path: string } | null } {
    const category = row.category;
    const subcategory = row.subcategory;
    const latestVersion = row.latest_version;
    const previewFile = latestVersion?.preview_file;
    const sourceFile = latestVersion?.source_file;

    // Log for debugging
    if (row.id && !previewFile && latestVersion) {
      console.log('[TemplateRepository.mapNewSchemaToEntity] Preview file missing', {
        template_id: row.id,
        latest_version_id: latestVersion.id,
        preview_file_id: latestVersion.preview_file_id,
        has_latest_version: !!latestVersion,
        latest_version_data: latestVersion,
      });
    }

    // Derive file_type from source_file mime_type
    let fileType: TemplateFileType = 'pdf';
    if (sourceFile?.mime_type) {
      const mimeType = sourceFile.mime_type.toLowerCase();
      if (mimeType === 'image/png') {
        fileType = 'png';
      } else if (mimeType === 'image/jpeg') {
        fileType = 'jpg';
      } else if (mimeType === 'image/webp') {
        fileType = 'webp';
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        fileType = 'docx';
      } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
        fileType = 'pptx';
      }
      // Default remains 'pdf' for application/pdf
    }

    return {
      id: row.id as string,
      organization_id: row.organization_id as string,
      // Map title to name for backward compatibility with TemplateEntity interface
      name: row.title as string,
      // New schema doesn't have these fields, set to null
      description: null,
      file_type: fileType,
      storage_path: '', // Not in new schema, fields are in versions
      preview_url: null, // Will be generated from preview_file if exists
      // status: removed - all templates are active and ready to use
      fields: [], // Fields are in certificate_template_fields table, not here
      width: null,
      height: null,
      // Map category/subcategory IDs and names
      certificate_category: category?.name as string | null,
      certificate_subcategory: subcategory?.name as string | null,
      created_by: row.created_by_user_id as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      deleted_at: row.deleted_at as string | null,
      // Add new schema fields as additional properties
      title: row.title as string,
      category_id: row.category_id as string,
      subcategory_id: row.subcategory_id as string,
      latest_version_id: row.latest_version_id as string | null,
      category_name: category?.name as string | null,
      subcategory_name: subcategory?.name as string | null,
      preview_file: previewFile ? {
        id: previewFile.id,
        bucket: previewFile.bucket,
        path: previewFile.path,
      } : null,
      source_file: sourceFile ? {
        id: sourceFile.id,
        bucket: sourceFile.bucket,
        path: sourceFile.path,
        mime_type: sourceFile.mime_type,
      } : null,
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
    // Create template record first (latest_version_id NULL initially)
    const { data, error } = await this.supabase
      .from('certificate_templates')
      .insert({
        organization_id: organizationId,
        category_id: dto.category_id,
        subcategory_id: dto.subcategory_id,
        title: dto.title,
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
    userId: string,
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
        created_by_user_id: userId,
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
    console.log('[TemplateRepository.getTemplateForEditor] Executing DB queries', {
      template_id: templateId,
      organizationId,
    });

    // Query 1: Template with latest version and files
    const { data: templateData, error: templateError } = await this.supabase
      .from('certificate_templates')
      .select(`
        id,
        title,
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
      console.error('[TemplateRepository.getTemplateForEditor] Template query error', {
        template_id: templateId,
        organizationId,
        error: templateError.message,
        error_code: templateError.code,
      });
      throw new Error(`[TemplateRepository.getTemplateForEditor] Failed to fetch template: ${templateError.message} (PostgREST code: ${templateError.code || 'unknown'})`);
    }

    if (!templateData) {
      console.log('[TemplateRepository.getTemplateForEditor] Template not found', {
        template_id: templateId,
        organizationId,
      });
      return null;
    }

    console.log('[TemplateRepository.getTemplateForEditor] Template query successful', {
      template_id: templateId,
      template: templateData,
      latest_version_id: templateData.latest_version_id,
    });

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
          // status: removed - all templates are active and ready to use
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
      console.error('[TemplateRepository.getTemplateForEditor] Fields query error', {
        template_id: templateId,
        version_id: versionData.id,
        error: fieldsError.message,
        error_code: fieldsError.code,
      });
      throw new Error(`[TemplateRepository.getTemplateForEditor] Failed to fetch fields: ${fieldsError.message} (PostgREST code: ${fieldsError.code || 'unknown'})`);
    }

    const result = {
      template: {
        id: templateData.id,
        title: templateData.title,
        // status: removed - all templates are active and ready to use
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

    console.log('[TemplateRepository.getTemplateForEditor] All queries successful', {
      template_id: templateId,
      organizationId,
      template: result.template,
      version: result.version,
      source_file: result.source_file ? { id: result.source_file.id, path: result.source_file.path } : null,
      fields_count: result.fields.length,
    });

    return result;
  }

  /**
   * Validate template belongs to organization and version belongs to template
   */
  async validateTemplateAndVersion(
    templateId: string,
    versionId: string,
    organizationId: string
  ): Promise<{ template: any; version: any }> {
    // Query version first (without embedding to avoid PostgREST relationship ambiguity)
    const { data: versionData, error: versionError } = await this.supabase
      .from('certificate_template_versions')
      .select('id, template_id, page_count')
      .eq('id', versionId)
      .eq('template_id', templateId)
      .maybeSingle();

    if (versionError && versionError.code !== 'PGRST116') {
      throw new Error(`[TemplateRepository.validateTemplateAndVersion] Failed to validate: ${versionError.message} (PostgREST code: ${versionError.code || 'unknown'})`);
    }

    if (!versionData) {
      return { template: null, version: null };
    }

    // Verify template belongs to organization and is not deleted
    const { data: templateData, error: templateError } = await this.supabase
      .from('certificate_templates')
      .select('id, organization_id')
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (templateError || !templateData) {
      return { template: null, version: null };
    }

    // Verify version belongs to the template (double-check)
    if (versionData.template_id !== templateId) {
      return { template: null, version: null };
    }

    return {
      template: {
        id: templateData.id,
        organization_id: templateData.organization_id,
      },
      version: {
        id: versionData.id,
        template_id: versionData.template_id,
        page_count: versionData.page_count,
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
    // Step 1: Upsert all fields (insert or update on conflict)
    // This handles race conditions where multiple requests might be updating simultaneously
    const fieldsToUpsert = fields.map(field => ({
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

    // Use upsert with ON CONFLICT to handle duplicates atomically
    const { data: upsertedFields, error: upsertError } = await this.supabase
      .from('certificate_template_fields')
      .upsert(fieldsToUpsert as any, {
        onConflict: 'template_version_id,field_key',
        ignoreDuplicates: false,
      })
      .select('id, field_key, label, type, page_number, x, y, width, height, style, required');

    if (upsertError) {
      throw new Error(`[TemplateRepository.replaceFields] Failed to upsert fields: ${upsertError.message} (PostgREST code: ${upsertError.code || 'unknown'})`);
    }

    // Step 2: Delete fields that are no longer in the new set (orphaned fields)
    // Only delete if we have fields to keep (if fields.length === 0, we'll delete all below)
    if (fields.length > 0) {
      const fieldKeysToKeep = new Set(fields.map(f => f.field_key));
      
      // Get all current field_keys for this version
      const { data: currentFields, error: fetchError } = await this.supabase
        .from('certificate_template_fields')
        .select('field_key')
        .eq('template_version_id', templateVersionId);

      if (fetchError) {
        // Log but don't fail - orphaned fields are not critical
        console.warn(`[TemplateRepository.replaceFields] Failed to fetch current fields for cleanup: ${fetchError.message}`);
      } else if (currentFields) {
        // Delete fields that are not in the new set
        const fieldsToDelete = currentFields
          .filter(f => !fieldKeysToKeep.has(f.field_key))
          .map(f => f.field_key);

        if (fieldsToDelete.length > 0) {
          const { error: deleteError } = await this.supabase
            .from('certificate_template_fields')
            .delete()
            .eq('template_version_id', templateVersionId)
            .in('field_key', fieldsToDelete);

          if (deleteError) {
            // Log but don't fail - orphaned fields are not critical
            console.warn(`[TemplateRepository.replaceFields] Failed to delete orphaned fields: ${deleteError.message}`);
          }
        }
      }
    } else {
      // If no fields provided, delete all fields for this version
      const { error: deleteError } = await this.supabase
        .from('certificate_template_fields')
        .delete()
        .eq('template_version_id', templateVersionId);

      if (deleteError) {
        throw new Error(`[TemplateRepository.replaceFields] Failed to delete all fields: ${deleteError.message} (PostgREST code: ${deleteError.code || 'unknown'})`);
      }
    }

    // Return the upserted fields
    return (upsertedFields ?? []).map((field: any) => ({
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

  // ============================================================================
  // TEMPLATE USAGE HISTORY METHODS
  // ============================================================================

  /**
   * Get recent template usage for a user
   * Returns both generated and in-progress templates
   */
  async getRecentUsage(
    organizationId: string,
    userId: string,
    options: { limit?: number } = {}
  ): Promise<{
    generated: any[];
    in_progress: any[];
  }> {
    const limit = options.limit ?? 10;

    console.log('[TemplateRepository.getRecentUsage] Fetching recent usage', {
      organizationId,
      userId,
      limit,
    });

    // Query using the view we created
    const { data, error } = await this.supabase
      .from('v_template_usage_recent')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false })
      .limit(limit * 2); // Fetch enough for both types

    if (error) {
      console.error('[TemplateRepository.getRecentUsage] Query error', {
        error: error.message,
        code: error.code,
      });
      // If view doesn't exist yet, return empty arrays
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return { generated: [], in_progress: [] };
      }
      throw new Error(`[TemplateRepository.getRecentUsage] Failed to fetch: ${error.message}`);
    }

    const generated = (data ?? [])
      .filter((row: any) => row.usage_type === 'generated')
      .slice(0, limit);
    const in_progress = (data ?? [])
      .filter((row: any) => row.usage_type === 'in_progress')
      .slice(0, limit);

    console.log('[TemplateRepository.getRecentUsage] Results', {
      generated_count: generated.length,
      in_progress_count: in_progress.length,
    });

    return { generated, in_progress };
  }

  /**
   * Save or update in-progress design
   * Uses upsert to handle both new and existing records
   */
  async saveInProgressDesign(
    organizationId: string,
    userId: string,
    templateId: string,
    templateVersionId: string | null,
    fieldSnapshot: Record<string, unknown>[]
  ): Promise<{ id: string }> {
    console.log('[TemplateRepository.saveInProgressDesign] Saving in-progress design', {
      organizationId,
      userId,
      templateId,
      templateVersionId,
      fields_count: fieldSnapshot.length,
    });

    const { data, error } = await this.supabase
      .from('template_usage_history')
      .upsert({
        organization_id: organizationId,
        user_id: userId,
        template_id: templateId,
        template_version_id: templateVersionId,
        usage_type: 'in_progress',
        field_snapshot: fieldSnapshot,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any, {
        onConflict: 'organization_id,user_id,template_id',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[TemplateRepository.saveInProgressDesign] Error', {
        error: error.message,
        code: error.code,
      });
      throw new Error(`[TemplateRepository.saveInProgressDesign] Failed: ${error.message}`);
    }

    return { id: data.id };
  }

  /**
   * Delete in-progress design (e.g., when user completes generation)
   */
  async deleteInProgressDesign(
    organizationId: string,
    userId: string,
    templateId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('template_usage_history')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('usage_type', 'in_progress');

    if (error) {
      console.error('[TemplateRepository.deleteInProgressDesign] Error', {
        error: error.message,
        code: error.code,
      });
      // Non-fatal - don't throw
    }
  }

  /**
   * Record template usage after successful generation
   */
  async recordGenerationUsage(
    organizationId: string,
    userId: string,
    templateId: string,
    templateVersionId: string | null,
    generationJobId: string,
    certificatesCount: number
  ): Promise<void> {
    console.log('[TemplateRepository.recordGenerationUsage] Recording generation usage', {
      organizationId,
      userId,
      templateId,
      generationJobId,
      certificatesCount,
    });

    // First, delete any in-progress design for this template
    await this.deleteInProgressDesign(organizationId, userId, templateId);

    // Then, upsert the generation record
    const { error } = await this.supabase
      .from('template_usage_history')
      .upsert({
        organization_id: organizationId,
        user_id: userId,
        template_id: templateId,
        template_version_id: templateVersionId,
        usage_type: 'generated',
        generation_job_id: generationJobId,
        field_snapshot: null,
        last_used_at: new Date().toISOString(),
        certificates_count: certificatesCount,
        updated_at: new Date().toISOString(),
      } as any, {
        onConflict: 'organization_id,user_id,template_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('[TemplateRepository.recordGenerationUsage] Error', {
        error: error.message,
        code: error.code,
      });
      // Non-fatal - don't throw, generation still succeeded
    }
  }

  /**
   * Get fields for a template version (to include in usage response)
   */
  async getVersionFields(versionId: string): Promise<Array<{
    id: string;
    field_key: string;
    label: string;
    type: string;
    page_number: number;
    x: number;
    y: number;
    width: number | null;
    height: number | null;
    style: Record<string, unknown> | null;
  }>> {
    const { data, error } = await this.supabase
      .from('certificate_template_fields')
      .select('id, field_key, label, type, page_number, x, y, width, height, style')
      .eq('template_version_id', versionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[TemplateRepository.getVersionFields] Error', {
        error: error.message,
        code: error.code,
      });
      return [];
    }

    return (data ?? []).map((f: any) => ({
      id: f.id,
      field_key: f.field_key,
      label: f.label,
      type: f.type,
      page_number: f.page_number,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      style: f.style,
    }));
  }
}
