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
    console.log('[TemplateService.getById] Calling repository.findById()', {
      template_id: id,
      organizationId,
    });

    const template = await this.repository.findById(id, organizationId);

    if (!template) {
      console.log('[TemplateService.getById] Template not found', {
        template_id: id,
        organizationId,
      });
      throw new NotFoundError('Template not found');
    }

    console.log('[TemplateService.getById] Template found', {
      template_id: id,
      organizationId,
      template: {
        id: template.id,
        name: template.name,
        status: template.status,
        has_storage_path: !!template.storage_path,
      },
    });

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
  ): Promise<{ templates: TemplateEntity[]; total: number }> {
    const limit = options.limit ?? 20;
    const page = options.page ?? 1;
    const offset = (page - 1) * limit;

    console.log('[TemplateService.list] Calling repository.findAll()', {
      organizationId,
      options: {
        status: options.status,
        limit,
        offset,
        sortBy: options.sortBy,
        sortOrder: options.sortOrder,
      },
    });

    const { data, count } = await this.repository.findAll(organizationId, {
      status: options.status,
      limit,
      offset,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
    });

    console.log('[TemplateService.list] Repository returned data', {
      organizationId,
      templates_count: data.length,
      total_count: count,
      template_ids: data.map(t => t.id),
    });

    // Generate preview URLs for templates that have preview files
    // Previews are generated at upload time, so we just fetch the stored preview URLs
    // Use Promise.allSettled to ensure one template error doesn't break the entire list
    const templatePromises = data.map(async (template) => {
      try {
        const templateWithPreview = template as any;
        
        // Log preview file status
        console.log('[TemplateService.list] Checking preview for template', {
          template_id: template.id,
          has_preview_file: !!templateWithPreview.preview_file,
          preview_file_id: templateWithPreview.preview_file?.id || null,
          latest_version_id: templateWithPreview.latest_version_id,
        });

        // If preview file exists (generated at upload time), use it
        if (templateWithPreview.preview_file?.path && templateWithPreview.preview_file?.bucket) {
          try {
            const previewUrl = await this.getPreviewUrlForPath(
              templateWithPreview.preview_file.bucket,
              templateWithPreview.preview_file.path
            );
            console.log('[TemplateService.list] Generated preview URL from stored preview file', {
              template_id: template.id,
              preview_file_id: templateWithPreview.preview_file.id,
              preview_url: previewUrl.substring(0, 50) + '...',
            });
            return {
              ...template,
              preview_url: previewUrl,
            };
          } catch (error) {
            console.warn('[TemplateService.list] Failed to generate preview URL from stored preview file', {
              template_id: template.id,
              preview_file_id: templateWithPreview.preview_file?.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Continue - template will be returned without preview_url
          }
        } 
        
        // Fallback: Use source file as preview if it's an image (for templates uploaded before preview generation was implemented)
        // This is a temporary fallback - new templates should always have previews generated at upload time
        if (!templateWithPreview.preview_file && templateWithPreview.source_file?.path && templateWithPreview.source_file?.bucket) {
          try {
            const sourceFile = templateWithPreview.source_file;
            const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            
            // Use source file as preview if it's an image (legacy templates only)
            if (sourceFile.mime_type && imageMimeTypes.includes(sourceFile.mime_type)) {
              console.log('[TemplateService.list] Using source file as preview (legacy fallback)', {
                template_id: template.id,
                source_file_mime_type: sourceFile.mime_type,
                note: 'This template was uploaded before preview generation was implemented',
              });

              const previewUrl = await this.getPreviewUrlForPath(
                sourceFile.bucket,
                sourceFile.path
              );
              
              console.log('[TemplateService.list] Generated preview URL from source file (fallback)', {
                template_id: template.id,
                preview_url: previewUrl.substring(0, 50) + '...',
              });

              return {
                ...template,
                preview_url: previewUrl,
              };
            }
          } catch (error) {
            console.warn('[TemplateService.list] Failed to generate preview URL from source file', {
              template_id: template.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Continue - template will be returned without preview_url
          }
        }
        
        console.log('[TemplateService.list] No preview available for template', {
          template_id: template.id,
          latest_version_id: templateWithPreview.latest_version_id,
          has_preview_file: !!templateWithPreview.preview_file,
          has_source_file: !!templateWithPreview.source_file,
        });
        return template;
      } catch (error) {
        // Catch any unexpected errors and return template without preview
        console.error('[TemplateService.list] Unexpected error processing template', {
          template_id: template.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          error_stack: error instanceof Error ? error.stack : undefined,
        });
        return template; // Return template without preview_url
      }
    });

    // Use Promise.allSettled to handle errors gracefully
    const results = await Promise.allSettled(templatePromises);
    const templatesWithPreviewUrls = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // If a template failed, log error and return template without preview_url
        const template = data[index];
        console.error('[TemplateService.list] Failed to process template preview', {
          template_id: template.id,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          error_stack: result.reason instanceof Error ? result.reason.stack : undefined,
        });
        return template; // Return template without preview_url
      }
    });

    // If includePreviewUrl is requested, batch generate signed URLs for legacy templates
    // For new schema templates, previews are already included from the join
    if (options.includePreviewUrl && templatesWithPreviewUrls.length > 0) {
      console.log('[TemplateService.list] Generating preview URLs', {
        organizationId,
        templates_count: templatesWithPreviewUrls.length,
      });
      const templatesWithUrls = await this.batchGeneratePreviewUrls(templatesWithPreviewUrls);
      console.log('[TemplateService.list] Preview URLs generated', {
        organizationId,
        templates_with_urls: templatesWithUrls.filter(t => t.preview_url).length,
      });
      return {
        templates: templatesWithUrls,
        total: count,
      };
    }

    console.log('[TemplateService.list] Returning templates with preview URLs', {
      organizationId,
      templates_count: templatesWithPreviewUrls.length,
      total: count,
      templates_with_preview: templatesWithPreviewUrls.filter(t => t.preview_url).length,
    });

    return {
      templates: templatesWithPreviewUrls,
      total: count,
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
   * Also deletes associated files from storage
   */
  async delete(id: string, organizationId: string): Promise<void> {
    // Verify template exists
    await this.getById(id, organizationId);

    // Get all file paths before deleting
    let filePaths: Array<{ bucket: string; path: string }> = [];
    try {
      filePaths = await this.repository.getTemplateFilePaths(id, organizationId);
      console.log('[TemplateService.delete] Found files to delete', {
        template_id: id,
        file_count: filePaths.length,
        files: filePaths.map(f => `${f.bucket}/${f.path}`),
      });
    } catch (error) {
      console.warn('[TemplateService.delete] Failed to get file paths (non-fatal)', {
        template_id: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue with delete even if we can't get file paths
    }

    // Delete files from storage
    if (filePaths.length > 0) {
      const supabase = getSupabaseClient();
      
      // Group files by bucket for batch deletion
      const filesByBucket = new Map<string, string[]>();
      filePaths.forEach(({ bucket, path }) => {
        if (!filesByBucket.has(bucket)) {
          filesByBucket.set(bucket, []);
        }
        filesByBucket.get(bucket)!.push(path);
      });

      // Delete files from each bucket
      for (const [bucket, paths] of filesByBucket.entries()) {
        try {
          const { error: deleteError } = await supabase.storage
            .from(bucket)
            .remove(paths);

          if (deleteError) {
            console.error('[TemplateService.delete] Failed to delete files from storage', {
              template_id: id,
              bucket,
              paths,
              error: deleteError.message,
            });
            // Continue with delete even if storage cleanup fails
          } else {
            console.log('[TemplateService.delete] Deleted files from storage', {
              template_id: id,
              bucket,
              file_count: paths.length,
            });
          }
        } catch (error) {
          console.error('[TemplateService.delete] Error deleting files from storage', {
            template_id: id,
            bucket,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Continue with delete even if storage cleanup fails
        }
      }
    }

    // Soft delete template (marks as deleted in database)
    await this.repository.delete(id, organizationId);
    
    console.log('[TemplateService.delete] Template deleted successfully', {
      template_id: id,
      organization_id: organizationId,
      files_deleted: filePaths.length,
    });
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
   * Generate signed URL for a preview file path (new schema)
   */
  private async getPreviewUrlForPath(bucket: string, path: string): Promise<string> {
    if (!bucket || !path) {
      throw new Error(`Invalid preview file data: bucket=${bucket}, path=${path}`);
    }

    // Check cache first
    const cached = getCachedSignedUrl(path);
    if (cached) {
      return cached;
    }

    // Generate signed URL (expires in 1 hour)
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);

    if (error || !data) {
      throw new Error(`Failed to generate signed URL for preview: ${error?.message || 'Unknown error'}`);
    }

    if (!data.signedUrl) {
      throw new Error('Signed URL generation returned empty result');
    }

    // Cache the signed URL (expires in 3600 seconds)
    setCachedSignedUrl(path, data.signedUrl, 3600);

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
    console.log('[TemplateService.createWithNewSchema] Starting template creation', {
      organizationId,
      userId,
      dto: {
        title: dto.title,
        category_id: dto.category_id,
        subcategory_id: dto.subcategory_id,
      },
      file: {
        mimetype: file.mimetype,
        originalname: file.originalname,
        size_bytes: file.buffer.length,
      },
    });

    const { CatalogRepository } = await import('../catalog/repository.js');
    const { computeSHA256 } = await import('../../lib/uploads/checksum.js');
    const { getPDFPageCount } = await import('../../lib/uploads/pdf-utils.js');
    const { validateFileUpload } = await import('../../lib/uploads/validator.js');
    const { sanitizeClientFilename } = await import('../../lib/uploads/filename.js');
    const supabase = getSupabaseClient();
    const catalogRepo = new CatalogRepository(supabase);

    // Validate file
    console.log('[TemplateService.createWithNewSchema] Validating file upload');
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

    console.log('[TemplateService.createWithNewSchema] File validated', {
      original_mimetype: file.mimetype,
      validated_mimetype: validatedMimetype,
    });

    // Validate category and subcategory
    console.log('[TemplateService.createWithNewSchema] Validating category and subcategory', {
      category_id: dto.category_id,
      subcategory_id: dto.subcategory_id,
    });
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

    // Validate title (required, trimmed)
    const trimmedTitle = dto.title.trim();
    if (trimmedTitle.length === 0) {
      throw new ValidationError('Title is required', {
        code: 'TITLE_REQUIRED',
        field: 'title',
      });
    }
    if (trimmedTitle.length > 255) {
      throw new ValidationError('Title must be 255 characters or less', {
        code: 'TITLE_TOO_LONG',
        field: 'title',
        length: trimmedTitle.length,
      });
    }

    // Step 1: Create template record first (to get template_id for storage path)
    let template_id: string;
    try {
      console.log('[TemplateService.createWithNewSchema] Creating template record in DB', {
        organizationId,
        userId,
        title: trimmedTitle,
        category_id: dto.category_id,
        subcategory_id: dto.subcategory_id,
      });

      const result = await this.repository.createWithNewSchema(
        organizationId,
        userId,
        {
          title: trimmedTitle,
          category_id: dto.category_id,
          subcategory_id: dto.subcategory_id,
        }
      );
      template_id = result.template_id;

      console.log('[TemplateService.createWithNewSchema] Template record created', {
        template_id,
      });
    } catch (error: any) {
      // Handle constraint violations
      if (error?.code === '23514' || error?.message?.includes('files_path_chk')) {
        const { handleStoragePathConstraintError } = await import('../../lib/storage/path-validator.js');
        throw handleStoragePathConstraintError(error, 'unknown', organizationId, undefined);
      }
      throw error;
    }

    let fileId: string | null = null;
    let storagePath: string | null = null;

    try {
      // Step 2: Generate canonical storage path using template_id
      const { generateTemplateSourcePath, getExtensionFromMimeType } = await import('../../lib/storage/path-validator.js');
      const extension = getExtensionFromMimeType(validatedMimetype);
      storagePath = generateTemplateSourcePath(organizationId, template_id, extension);

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

      // Step 5: Create file registry entry (with path validation)
      let file_id: string;
      try {
        console.log('[TemplateService.createWithNewSchema] Creating file registry entry', {
          organizationId,
          storage_path: storagePath,
          file_size_bytes: file.buffer.length,
          checksum: checksum.substring(0, 16) + '...',
        });

        const result = await this.repository.createFileEntry(
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
        file_id = result.file_id;
        fileId = file_id;

        console.log('[TemplateService.createWithNewSchema] File registry entry created', {
          file_id,
        });
      } catch (error: any) {
        // Handle constraint violations with detailed error
        if (error?.code === '23514' || error?.message?.includes('files_path_chk')) {
          const { handleStoragePathConstraintError } = await import('../../lib/storage/path-validator.js');
          throw handleStoragePathConstraintError(error, storagePath, organizationId, template_id);
        }
        throw error;
      }

      // Step 6: Create template version
      let version_id: string;
      try {
        console.log('[TemplateService.createWithNewSchema] Creating template version', {
          template_id,
          file_id,
          page_count: pageCount,
        });

        const result = await this.repository.createTemplateVersion(
          template_id,
          {
            version_number: 1,
            source_file_id: file_id,
            page_count: pageCount,
            normalized_pages: normalizedPages,
            preview_file_id: null, // Will be generated later
          }
        );
        version_id = result.version_id;

        console.log('[TemplateService.createWithNewSchema] Template version created', {
          version_id,
        });
      } catch (error: any) {
        // If version creation fails, cleanup file entry
        if (fileId) {
          await this.repository.deleteFile(fileId);
        }
        throw error;
      }

      // Step 7: Update template latest_version_id
      await this.repository.updateLatestVersion(template_id, version_id);

      // Step 8: Auto-generate preview for images (synchronous for images, async for PDFs)
      // This ensures preview URLs are available immediately when listing templates
      try {
        const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        
        if (imageMimeTypes.includes(validatedMimetype)) {
          console.log('[TemplateService.createWithNewSchema] Auto-generating preview for image template', {
            template_id,
            version_id,
            mime_type: validatedMimetype,
          });

          // For images, generate preview immediately (it's just copying/resizing the file)
          // This stores the preview_file_id in the version record for fast retrieval during list
          const previewResult = await this.generatePreview(template_id, version_id, organizationId, userId);
          
          console.log('[TemplateService.createWithNewSchema] Preview generated and stored successfully', {
            template_id,
            version_id,
            preview_file_id: previewResult.preview_file_id,
            preview_path: previewResult.preview_path,
          });
        } else {
          console.log('[TemplateService.createWithNewSchema] Skipping auto-preview generation for non-image file', {
            template_id,
            version_id,
            mime_type: validatedMimetype,
            note: 'Preview can be generated later via POST /templates/:templateId/versions/:versionId/preview',
          });
        }
      } catch (previewError) {
        // Preview generation failures are non-fatal - template creation should still succeed
        // But log the error so it can be debugged
        console.error('[TemplateService.createWithNewSchema] Failed to auto-generate preview (non-fatal)', {
          template_id,
          version_id,
          error: previewError instanceof Error ? previewError.message : 'Unknown error',
          error_stack: previewError instanceof Error ? previewError.stack : undefined,
        });
        // Template will be created without preview - user can generate it manually later
      }

      // Step 9: Create audit log
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
      console.log('[TemplateService.createWithNewSchema] Fetching created template data', {
        template_id,
      });

      const { data: templateData, error: templateFetchError } = await supabase
        .from('certificate_templates')
        .select('id, title, status, category_id, subcategory_id, latest_version_id, created_at')
        .eq('id', template_id)
        .single();

      if (templateFetchError || !templateData) {
        throw new Error(`Failed to fetch created template: ${templateFetchError?.message || 'No data returned'}`);
      }

      console.log('[TemplateService.createWithNewSchema] Template data fetched from DB', {
        template: templateData,
      });

      const { data: fileData, error: fileFetchError } = await supabase
        .from('files')
        .select('id, bucket, path, mime_type, size_bytes')
        .eq('id', file_id)
        .single();

      if (fileFetchError || !fileData) {
        throw new Error(`Failed to fetch file data: ${fileFetchError?.message || 'No data returned'}`);
      }

      console.log('[TemplateService.createWithNewSchema] File data fetched from DB', {
        file: fileData,
      });

      // Type assertions for Supabase response
      type TemplateRow = {
        id: string;
        title: string;
        status: string;
        category_id: string;
        subcategory_id: string;
        latest_version_id: string | null;
        created_at: string;
      };

      type FileRow = {
        id: string;
        bucket: string;
        path: string;
        mime_type: string;
        size_bytes: number;
      };

      const typedTemplateData = templateData as TemplateRow;
      const typedFileData = fileData as FileRow;

      const result = {
        template: {
          id: typedTemplateData.id,
          title: typedTemplateData.title,
          status: typedTemplateData.status,
          category_id: typedTemplateData.category_id,
          subcategory_id: typedTemplateData.subcategory_id,
          latest_version_id: typedTemplateData.latest_version_id,
          created_at: typedTemplateData.created_at,
        },
        version: {
          id: version_id,
          version_number: 1,
          page_count: pageCount,
          source_file: {
            id: typedFileData.id,
            bucket: typedFileData.bucket,
            path: typedFileData.path,
            mime_type: typedFileData.mime_type,
            size_bytes: typedFileData.size_bytes,
          },
        },
      };

      console.log('[TemplateService.createWithNewSchema] Returning result', {
        template_id: result.template.id,
        version_id: result.version.id,
        source_file_id: result.version.source_file.id,
      });

      return result;
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
    console.log('[TemplateService.getTemplateForEditor] Calling repository.getTemplateForEditor()', {
      template_id: templateId,
      organizationId,
    });

    const data = await this.repository.getTemplateForEditor(templateId, organizationId);

    if (!data) {
      console.log('[TemplateService.getTemplateForEditor] Template not found', {
        template_id: templateId,
        organizationId,
      });
      throw new NotFoundError('Template not found or does not belong to organization');
    }

    if (!data.version || !data.source_file) {
      console.log('[TemplateService.getTemplateForEditor] Missing version or source_file', {
        template_id: templateId,
        organizationId,
        has_version: !!data.version,
        has_source_file: !!data.source_file,
      });
      throw new NotFoundError('Template version or source file not found');
    }

    console.log('[TemplateService.getTemplateForEditor] Template data retrieved', {
      template_id: templateId,
      organizationId,
      template: {
        id: data.template.id,
        title: data.template.title,
        status: data.template.status,
      },
      version: {
        id: data.version.id,
        version_number: data.version.version_number,
        page_count: data.version.page_count,
      },
      source_file: {
        id: data.source_file.id,
        bucket: data.source_file.bucket,
        path: data.source_file.path,
      },
      fields_count: data.fields.length,
    });

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
      if (!field) {
        throw new ValidationError(`Field at index ${i} is missing`, {
          field: `fields[${i}]`,
        });
      }
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
    userId?: string
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
        type PreviewFileRow = {
          id: string;
          bucket: string;
          path: string;
        };
        const typedPreviewFile = previewFile as PreviewFileRow;
        return {
          status: 'already_exists',
          preview_file_id: typedPreviewFile.id,
          preview_bucket: typedPreviewFile.bucket,
          preview_path: typedPreviewFile.path,
        };
      }
    }

    // Generate preview
    const { generateTemplatePreview } = await import('./preview-generator.js');
    const result = await generateTemplatePreview(supabase, {
      organizationId: versionInfo.template.organization_id,
      templateId,
      versionId,
    });

    // Create audit log (only if userId is provided)
    if (userId) {
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
    }

    return {
      status: 'generated',
      preview_file_id: result.preview_file_id,
      preview_bucket: result.preview_bucket,
      preview_path: result.preview_path,
    };
  }
}
