/**
 * TEMPLATE SERVICE
 *
 * Business logic layer for certificate templates.
 */

import type { TemplateRepository } from './repository.js';
import type { TemplateEntity, CreateTemplateDTO, UpdateTemplateDTO } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { getCachedSignedUrl, setCachedSignedUrl } from '../../lib/cache/signed-url-cache.js';
import { validateFileUpload } from '../../lib/uploads/validator.js';
import { generateSecureFilename } from '../../lib/uploads/filename.js';

export class TemplateService {
  constructor(private readonly repository: TemplateRepository) {}

  /**
   * Get template by ID
   */
  async getById(id: string, companyId: string): Promise<TemplateEntity> {
    const template = await this.repository.findById(id, companyId);

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    return template;
  }

  /**
   * List templates
   */
  async list(
    companyId: string,
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

    const { data, count } = await this.repository.findAll(companyId, {
      status: options.status,
      limit,
      offset,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
    });

    // If includePreviewUrl is requested, batch generate signed URLs
    if (options.includePreviewUrl && data.length > 0) {
      const templatesWithUrls = await this.batchGeneratePreviewUrls(data);
      return {
        templates: templatesWithUrls,
        total: count,
      };
    }

    return {
      templates: data,
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
    companyId: string,
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
    const storagePath = `templates/${companyId}/${secureFilename}`;

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
    return this.repository.create(companyId, userId, dto, storagePath, previewUrl);
  }

  /**
   * Update template
   */
  async update(
    id: string,
    companyId: string,
    dto: UpdateTemplateDTO
  ): Promise<TemplateEntity> {
    // Verify template exists
    await this.getById(id, companyId);

    return this.repository.update(id, companyId, dto);
  }

  /**
   * Delete template
   */
  async delete(id: string, companyId: string): Promise<void> {
    // Verify template exists
    await this.getById(id, companyId);

    await this.repository.delete(id, companyId);
  }

  /**
   * Get signed URL for template preview
   * Uses cache-first approach
   */
  async getPreviewUrl(id: string, companyId: string): Promise<string> {
    const template = await this.getById(id, companyId);

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
   * Get certificate categories for company
   */
  async getCategories(companyId: string): Promise<{
    categories: string[];
    categoryMap: Record<string, string[]>;
    industry: string | null;
  }> {
    // Get company industry
    const industry = await this.repository.getCompanyIndustry(companyId);

    // Get categories
    const rows = await this.repository.getCategories(companyId, industry);

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
    console.log(`[TemplateService] getCategories for company ${companyId}:`, {
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
}
