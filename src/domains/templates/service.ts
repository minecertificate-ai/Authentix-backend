/**
 * TEMPLATE SERVICE
 *
 * Business logic layer for certificate templates.
 */

import type { TemplateRepository } from './repository.js';
import type { TemplateEntity, CreateTemplateDTO, UpdateTemplateDTO } from './types.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';

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

    return {
      templates: data,
      total: count,
    };
  }

  /**
   * Create template
   */
  async create(
    companyId: string,
    userId: string,
    dto: CreateTemplateDTO,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<TemplateEntity> {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new ValidationError('Invalid file type. Allowed: PDF, PNG, JPEG');
    }

    // Upload file to Supabase Storage
    const supabase = getSupabaseClient();
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storagePath = `templates/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('minecertificate')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
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
   */
  async getPreviewUrl(id: string, companyId: string): Promise<string> {
    const template = await this.getById(id, companyId);

    if (!template.preview_url) {
      throw new NotFoundError('Template preview URL not available');
    }

    // Generate signed URL (expires in 1 hour)
    const supabase = getSupabaseClient();
    const { data } = await supabase.storage
      .from('minecertificate')
      .createSignedUrl(template.storage_path, 3600);

    if (!data) {
      return template.preview_url; // Fallback to public URL
    }

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

    return {
      categories: sortedCategories,
      categoryMap,
      industry,
    };
  }
}
