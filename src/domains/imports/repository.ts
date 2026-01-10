/**
 * IMPORT REPOSITORY
 *
 * Data access layer for import jobs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJobEntity, ImportDataRowEntity, ImportJobStatus, ImportSourceType } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class ImportRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Find import job by ID
   */
  async findById(id: string, companyId: string): Promise<ImportJobEntity | null> {
    const { data, error } = await this.supabase
      .from('import_jobs')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find import job: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  /**
   * Find all import jobs for company
   */
  async findAll(
    companyId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ data: ImportJobEntity[]; count: number }> {
    let query = this.supabase
      .from('import_jobs')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
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
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 20) - 1
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to find import jobs: ${error.message}`);
    }

    return {
      data: (data ?? []).map((item) => this.mapToEntity(item)),
      count: count ?? 0,
    };
  }

  /**
   * Create import job
   */
  async create(
    companyId: string,
    userId: string,
    dto: {
      file_name: string;
      storage_path: string;
      file_storage_path: string | null;
      certificate_category?: string;
      certificate_subcategory?: string;
      template_id?: string;
      reusable: boolean;
      total_rows: number;
      source_type: string;
    }
  ): Promise<ImportJobEntity> {
    const { data, error } = await this.supabase
      .from('import_jobs')
      .insert({
        company_id: companyId,
        created_by: userId,
        file_name: dto.file_name,
        storage_path: dto.storage_path,
        file_storage_path: dto.file_storage_path,
        status: 'pending',
        total_rows: dto.total_rows,
        success_count: 0,
        failure_count: 0,
        processed_rows: 0,
        succeeded_rows: 0,
        failed_rows: 0,
        source_type: dto.source_type,
        data_persisted: false,
        reusable: dto.reusable,
        certificate_category: dto.certificate_category ?? null,
        certificate_subcategory: dto.certificate_subcategory ?? null,
        template_id: dto.template_id ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create import job: ${error.message}`);
    }

    return this.mapToEntity(data);
  }

  /**
   * Update import job
   */
  async update(
    id: string,
    companyId: string,
    updates: {
      status?: string;
      success_count?: number;
      failure_count?: number;
      processed_rows?: number;
      succeeded_rows?: number;
      failed_rows?: number;
      error_message?: string | null;
      errors?: Record<string, unknown> | null;
      mapping?: Record<string, unknown> | null;
      data_persisted?: boolean;
      started_at?: string | null;
      completed_at?: string | null;
    }
  ): Promise<ImportJobEntity> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...updates,
    };

    const { data, error } = await this.supabase
      .from('import_jobs')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update import job: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError('Import job not found');
    }

    return this.mapToEntity(data);
  }

  /**
   * Store import data rows
   */
  async storeDataRows(
    companyId: string,
    importJobId: string,
    rows: Array<{ row_number: number; data: Record<string, unknown> }>
  ): Promise<void> {
    const rowsToInsert = rows.map((row) => ({
      import_job_id: importJobId,
      company_id: companyId,
      row_number: row.row_number,
      data: row.data,
      is_deleted: false,
    }));

    const { error } = await this.supabase
      .from('import_data_rows')
      .insert(rowsToInsert);

    if (error) {
      throw new Error(`Failed to store import data rows: ${error.message}`);
    }
  }

  /**
   * Get import data rows
   */
  async getDataRows(
    importJobId: string,
    companyId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ data: ImportDataRowEntity[]; count: number }> {
    let query = this.supabase
      .from('import_data_rows')
      .select('*', { count: 'exact' })
      .eq('import_job_id', importJobId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('row_number', { ascending: true });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 100) - 1
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get import data rows: ${error.message}`);
    }

    return {
      data: (data ?? []).map((item) => this.mapToDataRowEntity(item)),
      count: count ?? 0,
    };
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: Record<string, unknown>): ImportJobEntity {
    return {
      id: row.id as string,
      company_id: row.company_id as string,
      created_by: row.created_by as string | null,
      file_name: row.file_name as string,
      storage_path: row.storage_path as string,
      file_storage_path: row.file_storage_path as string | null,
      status: (row.status as ImportJobStatus) ?? 'pending',
      total_rows: (row.total_rows as number) ?? 0,
      success_count: (row.success_count as number) ?? 0,
      failure_count: (row.failure_count as number) ?? 0,
      processed_rows: (row.processed_rows as number) ?? 0,
      succeeded_rows: (row.succeeded_rows as number) ?? 0,
      failed_rows: (row.failed_rows as number) ?? 0,
      error_message: row.error_message as string | null,
      errors: row.errors as Record<string, unknown> | null,
      mapping: row.mapping as Record<string, unknown> | null,
      source_type: (row.source_type as ImportSourceType) ?? 'csv',
      data_persisted: (row.data_persisted as boolean) ?? false,
      reusable: (row.reusable as boolean) ?? true,
      certificate_category_id: row.certificate_category_id as string | null,
      certificate_subcategory_id: row.certificate_subcategory_id as string | null,
      template_id: row.template_id as string | null,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      deleted_at: row.deleted_at as string | null,
    };
  }

  /**
   * Map database row to data row entity
   */
  private mapToDataRowEntity(row: Record<string, unknown>): ImportDataRowEntity {
    return {
      id: row.id as string,
      import_job_id: row.import_job_id as string,
      company_id: row.company_id as string,
      row_number: row.row_number as number,
      data: row.data as Record<string, unknown>,
      is_deleted: (row.is_deleted as boolean) ?? false,
      deleted_at: row.deleted_at as string | null,
      deleted_by: row.deleted_by as string | null,
      created_at: row.created_at as string,
    };
  }
}
