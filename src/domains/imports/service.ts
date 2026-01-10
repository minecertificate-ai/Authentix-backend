/**
 * IMPORT SERVICE
 *
 * Business logic for import job management.
 */

import * as XLSX from 'xlsx';
import type { ImportRepository } from './repository.js';
import type { ImportJobEntity, CreateImportJobDTO } from './types.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

export class ImportService {
  constructor(private readonly repository: ImportRepository) {}

  /**
   * Get import job by ID
   */
  async getById(id: string, companyId: string): Promise<ImportJobEntity> {
    const job = await this.repository.findById(id, companyId);

    if (!job) {
      throw new NotFoundError('Import job not found');
    }

    return job;
  }

  /**
   * List import jobs
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
  ): Promise<{ jobs: ImportJobEntity[]; total: number }> {
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
      jobs: data,
      total: count,
    };
  }

  /**
   * Create import job from file
   */
  async create(
    companyId: string,
    userId: string,
    dto: CreateImportJobDTO,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<ImportJobEntity> {
    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];

    const isValidType =
      allowedTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i);

    if (!isValidType) {
      throw new ValidationError(
        'Invalid file type. Allowed: CSV, XLS, XLSX'
      );
    }

    // Parse file
    let jsonData: Array<Record<string, unknown>>;
    let sourceType: string;

    try {
      if (file.originalname.endsWith('.csv')) {
        sourceType = 'csv';
        // For CSV, we'll use XLSX to parse
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
        jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<
          Record<string, unknown>
        >;
      } else {
        sourceType = 'excel';
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]!]!;
        jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<
          Record<string, unknown>
        >;
      }
    } catch (error) {
      throw new ValidationError('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
    }

    if (jsonData.length === 0) {
      throw new ValidationError('File is empty or has no data');
    }

    // Upload file to Supabase Storage
    const supabase = getSupabaseClient();
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storagePath = `imports/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('minecertificate')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Create import job
    const job = await this.repository.create(companyId, userId, {
      file_name: dto.file_name,
      storage_path: storagePath,
      file_storage_path: storagePath,
      certificate_category: dto.certificate_category,
      certificate_subcategory: dto.certificate_subcategory,
      template_id: dto.template_id,
      reusable: dto.reusable,
      total_rows: jsonData.length,
      source_type: sourceType,
    });

    // Optionally store data rows
    if (dto.reusable) {
      try {
        const rowsToStore = jsonData.map((row, index) => ({
          row_number: index + 1,
          data: row,
        }));

        await this.repository.storeDataRows(companyId, job.id, rowsToStore);

        // Update job to mark data as persisted
        await this.repository.update(job.id, companyId, {
          data_persisted: true,
        });
      } catch (error) {
        // Log error but don't fail the import job creation
        console.error('Failed to persist import data rows:', error);
      }
    }

    return job;
  }

  /**
   * Get import data rows
   */
  async getDataRows(
    importJobId: string,
    companyId: string,
    options: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ rows: Array<{ row_number: number; data: Record<string, unknown> }>; total: number }> {
    // Verify job exists
    await this.getById(importJobId, companyId);

    const limit = options.limit ?? 100;
    const page = options.page ?? 1;
    const offset = (page - 1) * limit;

    const { data, count } = await this.repository.getDataRows(
      importJobId,
      companyId,
      { limit, offset }
    );

    return {
      rows: data.map((row) => ({
        row_number: row.row_number,
        data: row.data,
      })),
      total: count,
    };
  }

  /**
   * Get signed URL for import file download
   */
  async getFileUrl(importJobId: string, companyId: string): Promise<string> {
    const job = await this.getById(importJobId, companyId);

    if (!job.file_storage_path) {
      throw new NotFoundError('Import file not found');
    }

    const supabase = getSupabaseClient();
    const { data } = await supabase.storage
      .from('minecertificate')
      .createSignedUrl(job.file_storage_path, 3600);

    if (!data) {
      throw new Error('Failed to generate signed URL');
    }

    return data.signedUrl;
  }
}
