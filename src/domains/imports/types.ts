/**
 * IMPORT TYPES
 *
 * Domain types for import job management.
 */

import { z } from 'zod';

/**
 * Import source type
 */
export const importSourceTypeSchema = z.enum(['csv', 'excel', 'api']);

export type ImportSourceType = z.infer<typeof importSourceTypeSchema>;

/**
 * Import job status
 */
export const importJobStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;

/**
 * Create import job DTO
 */
export const createImportJobSchema = z.object({
  file_name: z.string().min(1),
  certificate_category: z.string().optional(),
  certificate_subcategory: z.string().optional(),
  template_id: z.string().uuid().optional(),
  reusable: z.boolean().default(true),
});

export type CreateImportJobDTO = z.infer<typeof createImportJobSchema>;

/**
 * Import job entity
 */
export interface ImportJobEntity {
  id: string;
  company_id: string;
  created_by: string | null;
  file_name: string;
  storage_path: string;
  file_storage_path: string | null;
  status: ImportJobStatus;
  total_rows: number;
  success_count: number;
  failure_count: number;
  processed_rows: number;
  succeeded_rows: number;
  failed_rows: number;
  error_message: string | null;
  errors: Record<string, unknown> | null;
  mapping: Record<string, unknown> | null;
  source_type: ImportSourceType;
  data_persisted: boolean;
  reusable: boolean;
  certificate_category_id: string | null;
  certificate_subcategory_id: string | null;
  template_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Import data row entity
 */
export interface ImportDataRowEntity {
  id: string;
  import_job_id: string;
  company_id: string;
  row_number: number;
  data: Record<string, unknown>;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
}
