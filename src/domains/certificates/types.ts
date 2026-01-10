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
 * Certificate generation options
 */
export const generationOptionsSchema = z.object({
  includeQR: z.boolean().default(true),
  fileName: z.string().optional(),
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
 * Certificate generation result
 */
export interface CertificateGenerationResult {
  job_id?: string;
  status: 'completed' | 'pending' | 'processing' | 'failed';
  download_url?: string;
  total_certificates: number;
  certificates?: Array<{
    file_name: string;
    recipient_name: string;
  }>;
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
