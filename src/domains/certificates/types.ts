/**
 * CERTIFICATE TYPES
 *
 * Domain types for certificate generation and management.
 */

import { z } from 'zod';

/**
 * Field mapping schema
 */
export const fieldMappingSchema = z.object({
  fieldId: z.string(),
  columnName: z.string(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/**
 * Expiry type options
 */
export const expiryTypeSchema = z.enum([
  'day',      // 1 day from issue date
  'week',     // 1 week from issue date
  'month',    // 1 month from issue date
  'year',     // 1 year from issue date (DEFAULT)
  '5_years',  // 5 years from issue date
  'never',    // No expiry
  'custom',   // Custom date provided
]);

export type ExpiryType = z.infer<typeof expiryTypeSchema>;

/**
 * Certificate generation options
 */
export const generationOptionsSchema = z.object({
  includeQR: z.boolean().default(true),
  fileName: z.string().optional(),
  // Expiry options
  expiry_type: expiryTypeSchema.default('year'),
  custom_expiry_date: z.string().datetime().optional(), // Required if expiry_type = 'custom'
  // Issue date options
  issue_date: z.string().datetime().optional(), // Defaults to NOW()
});

export type GenerationOptions = z.infer<typeof generationOptionsSchema>;

/**
 * Generate certificates request DTO
 */
export const generateCertificatesSchema = z.object({
  template_id: z.string().uuid(),
  data: z.array(z.record(z.unknown())).min(1),
  field_mappings: z.array(fieldMappingSchema),
  options: generationOptionsSchema.optional(),
});

export type GenerateCertificatesDTO = z.infer<typeof generateCertificatesSchema>;

/**
 * Individual generated certificate info
 */
export interface GeneratedCertificateInfo {
  id: string;
  certificate_number: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  issued_at: string;
  expires_at: string | null;
  download_url: string | null;
  preview_url: string | null;
}

/**
 * Certificate generation result
 */
export interface CertificateGenerationResult {
  job_id?: string;
  status: 'completed' | 'pending' | 'processing' | 'failed';
  download_url?: string; // ZIP download URL (only if > 10 certificates)
  zip_download_url?: string; // Same as download_url for backwards compat
  total_certificates: number;
  certificates: GeneratedCertificateInfo[];
  error?: string;
}

/**
 * Certificate entity
 */
export interface CertificateEntity {
  id: string;
  company_id: string;
  certificate_template_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  course_name: string | null;
  issue_date: string;
  expiry_date: string | null;
  certificate_number: string;
  storage_path: string;
  preview_url: string | null;
  verification_code: string;
  verification_token: string | null;
  status: 'issued' | 'revoked' | 'expired';
  issued_by: string | null;
  created_at: string;
  updated_at: string;
}
