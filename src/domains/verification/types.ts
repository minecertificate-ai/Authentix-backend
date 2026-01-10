/**
 * VERIFICATION TYPES
 *
 * Domain types for certificate verification.
 */

import { z } from 'zod';

/**
 * Verify certificate request DTO
 */
export const verifyCertificateSchema = z.object({
  token: z.string().min(1),
});

export type VerifyCertificateDTO = z.infer<typeof verifyCertificateSchema>;

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  certificate_id?: string;
  recipient_name?: string;
  course_name?: string | null;
  issued_at?: string;
  expiry_date?: string | null;
  status?: string;
  company_name?: string;
  company_logo?: string | null;
  result: 'valid' | 'revoked' | 'expired' | 'not_found';
  message: string;
}

/**
 * Verification log entity
 */
export interface VerificationLogEntity {
  id: string;
  company_id: string;
  certificate_id: string | null;
  result: string;
  verifier_ip: string | null;
  verifier_user_agent: string | null;
  verified_at: string;
  created_at: string;
}
