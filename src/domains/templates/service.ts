/**
 * TEMPLATE SERVICE
 *
 * Business logic layer for certificate templates.
 */

import type { TemplateRepository } from './repository.js';
import type { TemplateEntity, CreateTemplateDTO, UpdateTemplateDTO, TemplateEditorData, UpdateFieldsDTO } from './types.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { getCachedSignedUrl, setCachedSignedUrl } from '../../lib/cache/signed-url-cache.js';
import { validateFileUpload } from '../../lib/uploads/validator.js';
import { generateSecureFilename } from '../../lib/uploads/filename.js';

export class TemplateService {
  constructor(private readonly repository: TemplateRepository) {}

  /**
   * Get template by ID
   */
  async getById(id: string, organizationId: string): Promise<TemplateEntity> {
    const template = await this.repository.findById(id, organizationId);

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    return template;
  }

  /**
   * List templates
   */
  async list(
    organizationId: string,
    options: {
      status?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includePreviewUrl?: boolean;
    } = {}
  ): Promise<{ templates: TemplateEntity[]; total: number; previews?: Array<{ template_id: string; preview_file: any | null }> }> {
    const limit = options.limit ?? 20;
    const page = options.page ?? 1;
    const offset = (page - 1) * limit;

    const { data, count, previews } = await this.repository.findAll(organizationId, {
      status: options.status,
      limit,
      offset,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
      includePreview: options.includePreviewUrl,
    });

    // If includePreviewUrl is requested, batch generate signed URLs for legacy templates
    // For new schema templates, previews are already included from the join
    if (options.includePreviewUrl && data.length > 0) {
      const templatesWithUrls = await this.batchGeneratePreviewUrls(data);
      return {
        templates: templatesWithUrls,
        total: count,
        previews,
      };
    }

    return {
      templates: data,
      total: count,
      previews,
    };
  }

  /**
   * Batch generate signed preview URLs for multiple templates
   * Uses cache-first approach and Supabase batch API for efficiency
   */
  private async batchGeneratePreviewUrls(templates: TemplateEntity[]): Promise<TemplateEntity[]> {
    const supabase = getSupabaseClient();
    const pathsToFetch: string[] = [];
    const pathIndexMap: Map<string, number[]> = new Map();

    // Check cache first
    templates.forEach((template, index) => {
      if (!template.storage_path) return;

      const cached = getCachedSignedUrl(template.storage_path);
      if (cached) {
        // Cache hit - use cached URL
        template.preview_url = cached;
      } else {
        // Cache miss - need to fetch
        pathsToFetch.push(template.storage_path);

        const indices = pathIndexMap.get(template.storage_path) || [];
        indices.push(index);
        pathIndexMap.set(template.storage_path, indices);
      }
    });

    // If all URLs were cached, return early
    if (pathsToFetch.length === 0) {
      return templates;
    }

    // Batch generate signed URLs for cache misses
    try {
      const { data: signedUrls, error } = await supabase.storage
        .from('minecertificate')
        .createSignedUrls(pathsToFetch, 3600); // 1 hour expiry

      if (error || !signedUrls) {
        // Fallback: use existing preview URLs
        console.error('Failed to batch generate signed URLs:', error);
        return templates;
      }

      // Map signed URLs back to templates and cache them
      const urlMap = new Map<string, string>();
      signedUrls.forEach((item, index) => {
        if (item.signedUrl) {
          const path = pathsToFetch[index];
          if (path) {
            urlMap.set(path, item.signedUrl);
            // Cache each URL individually (expires in 3600 seconds)
            setCachedSignedUrl(path, item.signedUrl, 3600);
          }
        }
      });

      // Update templates with signed URLs
      pathIndexMap.forEach((indices, path) => {
        const signedUrl = urlMap.get(path);
        if (signedUrl) {
          indices.forEach((index) => {
            templates[index]!.preview_url = signedUrl;
          });
        }
      });

      return templates;
    } catch (error) {
      console.error('Error batch generating signed URLs:', error);
      return templates; // Fallback to existing URLs
    }

    // If previews were included, attach them to response
    if (options.includePreviewUrl && previews) {
      return { templates, total: count, previews };
    }

    return { templates, total: count };
  }

  /**
   * Create template
   * Uses magic byte validation for security (OWASP compliant)
   */
  async create(
    organizationId: string,
    userId: string,
    dto: CreateTemplateDTO,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<TemplateEntity> {
    // Validate file using magic byte detection (prevents file spoofing)
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
    ] as const;

    const validationResult = await validateFileUpload(
      file.buffer,
      file.mimetype,
      allowedMimeTypes
    );

    // Use validated mimetype (from magic bytes) instead of client-provided
    const validatedMimetype = validationResult.detectedType;

    // Upload file to Supabase Storage with secure filename
    const supabase = getSupabaseClient();

    // Generate secure filename (never trust client input)
    const secureFilename = generateSecureFilename(validatedMimetype);
    const storagePath = `templates/${organizationId}/${secureFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('minecertificate')
      .upload(storagePath, file.buffer, {
        contentType: validatedMimetype, // Use validated mimetype
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('minecertificate')
      .getPublicUrl(storagePath);

    const previewUrl = urlData.publicUrl;

    // Create template record
    return this.repository.create(organizationId, userId, dto, storagePath, previewUrl);
  }

  /**
   * Update template
   */
  async update(
    id: string,
    organizationId: string,
    dto: UpdateTemplateDTO
  ): Promise<TemplateEntity> {
    // Verify template exists
    await this.getById(id, organizationId);

    return this.repository.update(id, organizationId, dto);
  }

  /**
   * Delete template
   */
  async delete(id: string, organizationId: string): Promise<void> {
    // Verify template exists
    await this.getById(id, organizationId);

    await this.repository.delete(id, organizationId);
  }

  /**
   * Get signed URL for template preview
   * Uses cache-first approach
   */
  async getPreviewUrl(id: string, organizationId: string): Promise<string> {
    const template = await this.getById(id, organizationId);

    if (!template.storage_path) {
      throw new NotFoundError('Template storage path not available');
    }

    // Check cache first
    const cached = getCachedSignedUrl(template.storage_path);
    if (cached) {
      return cached;
    }

    // Generate signed URL (expires in 1 hour)
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from('minecertificate')
      .createSignedUrl(template.storage_path, 3600);

    if (error || !data) {
      // Fallback to public URL if available
      if (template.preview_url) {
        return template.preview_url;
      }
      throw new Error('Failed to generate signed URL');
    }

    // Cache the signed URL (expires in 3600 seconds)
    setCachedSignedUrl(template.storage_path, data.signedUrl, 3600);

    return data.signedUrl;
  }

  /**
   * Get certificate categories for organization
   */
  async getCategories(organizationId: string): Promise<{
    categories: string[];
    categoryMap: Record<string, string[]>;
    industry: string | null;
  }> {
    // Get organization industry
    const industry = await this.repository.getOrganizationIndustry(organizationId);

    // Get categories
    const rows = await this.repository.getCategories(organizationId, industry);

    // Build category map
    const categoryMap: Record<string, string[]> = {};
    const categorySet = new Set<string>();

    rows.forEach((row) => {
      const category = row.certificate_category;
      const subcategory = row.certificate_subcategory;

      if (!category) return;

      categorySet.add(category);

      if (!categoryMap[category]) {
        categoryMap[category] = [];
      }

      const subcategories = categoryMap[category];
      if (subcategories && subcategory && !subcategories.includes(subcategory)) {
        subcategories.push(subcategory);
      }
    });

    // Sort categories and subcategories
    const sortedCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
    Object.keys(categoryMap).forEach((cat) => {
      const subcategories = categoryMap[cat];
      if (subcategories) {
        subcategories.sort((a, b) => a.localeCompare(b));
      }
    });

    // Log for debugging
    console.log(`[TemplateService] getCategories for organization ${organizationId}:`, {
      industry,
      rowsFound: rows.length,
      categoriesFound: sortedCategories.length,
    });

    return {
      categories: sortedCategories,
      categoryMap,
      industry,
    };
  }

  /**
   * Create template with new schema (certificate_templates, certificate_template_versions, files)
   * Implements the new upload flow with proper storage structure and file registry
   */
  async createWithNewSchema(
    organizationId: string,
    userId: string,
    dto: {
      title: string;
      category_id: string;
      subcategory_id: string;
    },
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<{
    template: {
      id: string;
      title: string;
      status: string;
      category_id: string;
      subcategory_id: string;
      latest_version_id: string | null;
      created_at: string;
    };
    version: {
      id: string;
      version_number: number;
      page_count: number;
      source_file: {
        id: string;
        bucket: string;
        path: string;
        mime_type: string;
        size_bytes: number;
      };
    };
  }> {
    const { CatalogRepository } = await import('../catalog/repository.js');
    const { computeSHA256 } = await import('../../lib/uploads/checksum.js');
    const { getPDFPageCount } = await import('../../lib/uploads/pdf-utils.js');
    const { validateFileUpload } = await import('../../lib/uploads/validator.js');
    const { generateSecureFilename, sanitizeClientFilename } = await import('../../lib/uploads/filename.js');
    const supabase = getSupabaseClient();
    const catalogRepo = new CatalogRepository(supabase);

    // Validate file
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    ] as const;

    const validationResult = await validateFileUpload(
      file.buffer,
      file.mimetype,
      allowedMimeTypes
    );

    const validatedMimetype = validationResult.detectedType;

    // Validate category and subcategory
    const isValidCategory = await catalogRepo.validateCategoryForOrganization(
      organizationId,
      dto.category_id
    );

    if (!isValidCategory) {
      throw new ValidationError('Category not found or hidden for organization', {
        code: 'invalid_category_or_subcategory',
        category_id: dto.category_id,
      });
    }

    const isValidSubcategory = await catalogRepo.validateSubcategoryForOrganization(
      organizationId,
      dto.subcategory_id,
      dto.category_id
    );

    if (!isValidSubcategory) {
      throw new ValidationError('Subcategory not found, hidden, or does not belong to category', {
        code: 'invalid_category_or_subcategory',
        subcategory_id: dto.subcategory_id,
        category_id: dto.category_id,
      });
    }

    // Step 1: Create template record first (to get template_id for storage path)
    const { template_id } = await this.repository.createWithNewSchema(
      organizationId,
      userId,
      {
        title: dto.title.trim(),
        category_id: dto.category_id,
        subcategory_id: dto.subcategory_id,
      }
    );

    let fileId: string | null = null;
    let storagePath: string | null = null;

    try {
      // Step 2: Generate storage path using template_id
      const secureFilename = generateSecureFilename(validatedMimetype);
      storagePath = `certificate_templates/${organizationId}/${template_id}/v0001/source/${secureFilename}`;

      // Step 3: Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('authentix')
        .upload(storagePath, file.buffer, {
          contentType: validatedMimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
      }

      // Step 4: Compute checksum and page count
      const checksum = computeSHA256(file.buffer);
      let pageCount = 1;
      let normalizedPages: Record<string, unknown> | null = null;

      if (validatedMimetype === 'application/pdf') {
        pageCount = await getPDFPageCount(file.buffer);
        // Store minimal normalized_pages for now (can be enhanced later)
        normalizedPages = { page_count: pageCount };
      }

      // Step 5: Create file registry entry
      const { file_id } = await this.repository.createFileEntry(
        organizationId,
        userId,
        {
          bucket: 'authentix',
          path: storagePath,
          kind: 'template_source',
          original_name: sanitizeClientFilename(file.originalname),
          mime_type: validatedMimetype,
          size_bytes: file.buffer.length,
          checksum_sha256: checksum,
        }
      );

      fileId = file_id;

      // Step 6: Create template version
      const { version_id } = await this.repository.createTemplateVersion(
        template_id,
        {
          version_number: 1,
          source_file_id: file_id,
          page_count: pageCount,
          normalized_pages: normalizedPages,
          preview_file_id: null, // Will be generated in Step 5
        }
      );

      // Step 7: Update template latest_version_id
      await this.repository.updateLatestVersion(template_id, version_id);

      // Step 8: Create audit log
      try {
        await supabase.from('app_audit_logs').insert({
          organization_id: organizationId,
          actor_user_id: userId,
          action: 'template.created',
          entity_type: 'certificate_template',
          entity_id: template_id,
          metadata: {
            category_id: dto.category_id,
            subcategory_id: dto.subcategory_id,
            version_number: 1,
            source_path: storagePath,
          },
        } as any);
      } catch (auditError) {
        // Audit log failures are non-fatal
        console.warn('[TemplateService.createWithNewSchema] Failed to create audit log:', auditError);
      }

      // Fetch created template for response
      const { data: templateData, error: templateFetchError } = await supabase
        .from('certificate_templates')
        .select('id, title, status, category_id, subcategory_id, latest_version_id, created_at')
        .eq('id', template_id)
        .single();

      if (templateFetchError || !templateData) {
        throw new Error(`Failed to fetch created template: ${templateFetchError?.message || 'No data returned'}`);
      }

      const { data: fileData, error: fileFetchError } = await supabase
        .from('files')
        .select('id, bucket, path, mime_type, size_bytes')
        .eq('id', file_id)
        .single();

      if (fileFetchError || !fileData) {
        throw new Error(`Failed to fetch file data: ${fileFetchError?.message || 'No data returned'}`);
      }

      return {
        template: {
          id: templateData.id,
          title: templateData.title,
          status: templateData.status,
          category_id: templateData.category_id,
          subcategory_id: templateData.subcategory_id,
          latest_version_id: templateData.latest_version_id,
          created_at: templateData.created_at,
        },
        version: {
          id: version_id,
          version_number: 1,
          page_count: pageCount,
          source_file: {
            id: fileData.id,
            bucket: fileData.bucket,
            path: fileData.path,
            mime_type: fileData.mime_type,
            size_bytes: fileData.size_bytes,
          },
        },
      };
    } catch (error) {
      // Cleanup on failure
      if (fileId) {
        await this.repository.deleteFile(fileId);
      }
      if (storagePath) {
        // Best effort: try to delete storage object
        try {
          await supabase.storage.from('authentix').remove([storagePath]);
        } catch (storageError) {
          console.error('[TemplateService.createWithNewSchema] Failed to delete storage object:', storageError);
        }
      }
      await this.repository.deleteTemplate(template_id);

      throw error;
    }
  }

  /**
   * Get template editor data (template + version + files + fields)
   * Validates template belongs to organization
   */
  async getTemplateForEditor(
    templateId: string,
    organizationId: string
  ): Promise<TemplateEditorData> {
    const data = await this.repository.getTemplateForEditor(templateId, organizationId);

    if (!data) {
      throw new NotFoundError('Template not found or does not belong to organization');
    }

    if (!data.version || !data.source_file) {
      throw new NotFoundError('Template version or source file not found');
    }

    return {
      template: data.template,
      latest_version: data.version,
      source_file: data.source_file,
      preview_file: data.preview_file,
      fields: data.fields,
    };
  }

  /**
   * Update fields for a template version
   * Validates all field data and replaces existing fields atomically
   */
  async updateFields(
    templateId: string,
    versionId: string,
    organizationId: string,
    dto: UpdateFieldsDTO
  ): Promise<{
    fields: Array<{
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
      required: boolean;
    }>;
    fields_count: number;
    updated_at: string;
  }> {
    // Validate template and version belong to organization
    const validation = await this.repository.validateTemplateAndVersion(
      templateId,
      versionId,
      organizationId
    );

    if (!validation.template || !validation.version) {
      throw new NotFoundError('Template or version not found or does not belong to organization');
    }

    const pageCount = validation.version.page_count;

    // Validate each field
    const fieldKeys = new Set<string>();
    for (let i = 0; i < dto.fields.length; i++) {
      const field = dto.fields[i];
      const fieldPath = `fields[${i}]`;

      // Validate field_key uniqueness
      if (fieldKeys.has(field.field_key)) {
        throw new ValidationError(`Duplicate field_key: ${field.field_key}`, {
          field: fieldPath,
          field_key: field.field_key,
        });
      }
      fieldKeys.add(field.field_key);

      // Validate field_key format (already validated by schema, but double-check)
      if (!/^[a-z0-9_]+$/.test(field.field_key)) {
        throw new ValidationError(`field_key must be lowercase alphanumeric with underscores only: ${field.field_key}`, {
          field: fieldPath,
          field_key: field.field_key,
        });
      }

      // Validate label
      const trimmedLabel = field.label.trim();
      if (trimmedLabel.length < 2 || trimmedLabel.length > 80) {
        throw new ValidationError(`label must be between 2 and 80 characters`, {
          field: fieldPath,
          label: field.label,
        });
      }

      // Validate page_number
      if (field.page_number < 1) {
        throw new ValidationError(`page_number must be >= 1`, {
          field: fieldPath,
          page_number: field.page_number,
        });
      }
      if (field.page_number > pageCount) {
        throw new ValidationError(`page_number (${field.page_number}) exceeds page_count (${pageCount})`, {
          field: fieldPath,
          page_number: field.page_number,
          page_count: pageCount,
        });
      }

      // Validate coordinates
      if (field.x < 0) {
        throw new ValidationError(`x must be >= 0`, {
          field: fieldPath,
          x: field.x,
        });
      }
      if (field.y < 0) {
        throw new ValidationError(`y must be >= 0`, {
          field: fieldPath,
          y: field.y,
        });
      }

      // Validate dimensions if provided
      if (field.width !== undefined && field.width !== null && field.width <= 0) {
        throw new ValidationError(`width must be > 0 if provided`, {
          field: fieldPath,
          width: field.width,
        });
      }
      if (field.height !== undefined && field.height !== null && field.height <= 0) {
        throw new ValidationError(`height must be > 0 if provided`, {
          field: fieldPath,
          height: field.height,
        });
      }

      // Validate style JSONB size (max 8KB)
      if (field.style) {
        const styleSize = JSON.stringify(field.style).length;
        if (styleSize > 8192) {
          throw new ValidationError(`style JSONB exceeds 8KB limit (${styleSize} bytes)`, {
            field: fieldPath,
            style_size: styleSize,
          });
        }
      }
    }

    // Replace fields (delete + bulk insert)
    const savedFields = await this.repository.replaceFields(versionId, dto.fields);

    return {
      fields: savedFields,
      fields_count: savedFields.length,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Generate preview for a template version
   * Idempotent: skips if preview already exists
   */
  async generatePreview(
    templateId: string,
    versionId: string,
    organizationId: string,
    userId: string
  ): Promise<{
    status: 'generated' | 'already_exists';
    preview_file_id: string | null;
    preview_bucket: string | null;
    preview_path: string | null;
  }> {
    const supabase = getSupabaseClient();

    // Validate template and version belong to organization
    const validation = await this.repository.validateTemplateAndVersion(
      templateId,
      versionId,
      organizationId
    );

    if (!validation.template || !validation.version) {
      throw new NotFoundError('Template or version not found or does not belong to organization');
    }

    // Get version info for preview generation
    const versionInfo = await this.repository.getVersionForPreview(versionId);
    if (!versionInfo || !versionInfo.template || !versionInfo.source_file) {
      throw new NotFoundError('Version or source file not found');
    }

    // Check if preview already exists (idempotency)
    if (versionInfo.version.preview_file_id) {
      const { data: previewFile } = await supabase
        .from('files')
        .select('id, bucket, path')
        .eq('id', versionInfo.version.preview_file_id)
        .single();

      if (previewFile) {
        return {
          status: 'already_exists',
          preview_file_id: previewFile.id,
          preview_bucket: previewFile.bucket,
          preview_path: previewFile.path,
        };
      }
    }

    // Generate preview
    const { generateTemplatePreview } = await import('./preview-generator.js');
    const result = await generateTemplatePreview(supabase, {
      organizationId: versionInfo.template.organization_id,
      templateId,
      versionId,
      versionNumber: versionInfo.version.version_number,
    });

    // Create audit log
    try {
      await supabase.from('app_audit_logs').insert({
        organization_id: organizationId,
        actor_user_id: userId,
        action: 'template.preview_generated',
        entity_type: 'certificate_template_version',
        entity_id: versionId,
        metadata: {
          template_id: templateId,
          preview_file_id: result.preview_file_id,
          path: result.preview_path,
        },
      } as any);
    } catch (auditError) {
      // Audit log failures are non-fatal
      console.warn('[TemplateService.generatePreview] Failed to create audit log:', auditError);
    }

    return {
      status: 'generated',
      preview_file_id: result.preview_file_id,
      preview_bucket: result.preview_bucket,
      preview_path: result.preview_path,
    };
  }
}
