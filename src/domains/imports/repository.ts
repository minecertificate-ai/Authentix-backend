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
  async findById(id: string, organizationId: string): Promise<ImportJobEntity | null> {
    const { data, error } = await this.supabase
      .from('file_import_jobs')
      .select(`
        id,
        organization_id,
        template_id,
        template_version_id,
        category_id,
        subcategory_id,
        source_file_id,
        source_format,
        mapping,
        status,
        row_count,
        success_count,
        failed_count,
        created_by_user_id,
        created_at,
        updated_at,
        completed_at,
        error,
        source_file:source_file_id (
          id,
          original_name,
          mime_type,
          size_bytes,
          bucket,
          path
        )
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find import job: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  /**
   * Find all import jobs for organization
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
  ): Promise<{ data: ImportJobEntity[]; count: number }> {
    let query = this.supabase
      .from('file_import_jobs')
      .select(`
        id,
        organization_id,
        template_id,
        template_version_id,
        category_id,
        subcategory_id,
        source_file_id,
        source_format,
        mapping,
        status,
        row_count,
        success_count,
        failed_count,
        created_by_user_id,
        created_at,
        updated_at,
        completed_at,
        error,
        source_file:source_file_id (
          id,
          original_name,
          mime_type,
          size_bytes,
          bucket,
          path
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId);

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
    organizationId: string,
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
      .from('file_import_jobs')
      .insert({
        organization_id: organizationId,
        created_by_user_id: userId,
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
    organizationId: string,
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
      .from('file_import_jobs')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
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
    organizationId: string,
    importJobId: string,
    rows: Array<{ row_number: number; data: Record<string, unknown> }>
  ): Promise<void> {
    const rowsToInsert = rows.map((row) => ({
      import_job_id: importJobId,
      organization_id: organizationId,
      row_number: row.row_number,
      data: row.data,
      is_deleted: false,
    }));

    const { error } = await this.supabase
      .from('file_import_rows')
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
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ data: ImportDataRowEntity[]; count: number }> {
    let query = this.supabase
      .from('file_import_rows')
      .select('*', { count: 'exact' })
      .eq('import_job_id', importJobId)
      .eq('organization_id', organizationId)
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
      organization_id: row.organization_id as string,
      created_by_user_id: row.created_by_user_id as string | null,
      file_name: row.file_name as string | null,
      file_type: row.file_type as string | null,
      file_size: row.file_size as number | null,
      status: (row.status as ImportJobStatus) ?? 'pending',
      success_count: (row.success_count as number) ?? 0,
      failed_count: (row.failed_count as number) ?? 0,
      total_rows: (row.total_rows as number) ?? 0,
      error_message: row.error_message as string | null,
      mapping: row.mapping as Record<string, unknown> | null,
      source_type: (row.source_type as ImportSourceType) ?? 'csv',
      reusable: (row.reusable as boolean) ?? true,
      category_id: row.category_id as string | null,
      subcategory_id: row.subcategory_id as string | null,
      template_id: (row.template_id as string) || '',
      template_version_id: (row.template_version_id as string) || '',
      completed_at: row.completed_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  /**
   * Map database row to data row entity
   */
  private mapToDataRowEntity(row: Record<string, unknown>): ImportDataRowEntity {
    return {
      id: row.id as string,
      import_job_id: row.import_job_id as string,
      row_index: row.row_index as number,
      data: row.data as Record<string, unknown>,
      raw_data: row.raw_data as Record<string, unknown> | null,
      status: row.status as string,
      errors: row.errors as Record<string, unknown> | null,
      created_at: row.created_at as string,
    };
  }
}
