/**
 * IMPORT TYPES
 *
 * Domain types for import job management.
 */

import { z } from 'zod';

/**
 * Import source type
 */
export const importSourceTypeSchema = z.enum(['csv', 'excel']);

export type ImportSourceType = z.infer<typeof importSourceTypeSchema>;

/**
 * Import job status
 */
export const importJobStatusSchema = z.enum([
  'queued',
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
  certificate_template_id: z.string().uuid().optional(),
  reusable: z.boolean().default(true),
});

export type CreateImportJobDTO = z.infer<typeof createImportJobSchema>;

/**
 * Import job entity
 */
export interface ImportJobEntity {
  id: string;
  organization_id: string;
  created_by_user_id: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: ImportJobStatus;
  success_count: number;
  failed_count: number;
  total_rows: number;
  error_message: string | null;
  mapping: Record<string, unknown> | null;
  source_type: ImportSourceType;
  reusable: boolean;
  category_id: string | null;
  subcategory_id: string | null;
  template_id: string;
  template_version_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Import data row entity
 */
export interface ImportDataRowEntity {
  id: string;
  import_job_id: string;
  row_index: number;
  data: Record<string, unknown>;
  raw_data: Record<string, unknown> | null;
  status: string;
  errors: Record<string, unknown> | null;
  created_at: string;
}
