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
 * Verification result - Enhanced with full certificate and organization details
 */
export interface VerificationResult {
  valid: boolean;
  result: 'valid' | 'revoked' | 'expired' | 'not_found';
  message: string;

  // Certificate details (only present if found)
  certificate?: {
    id: string;
    certificate_number: string;
    recipient_name: string;
    recipient_email: string | null;
    category_name: string;
    subcategory_name: string;
    issued_at: string;
    expires_at: string | null;
    status: string;
    revoked_at?: string | null;
    revoked_reason?: string | null;
  };

  // Organization details (only present if found)
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    website_url: string | null;
  };

  // Certificate preview URL (signed, for display)
  preview_url?: string | null;

  // Legacy fields for backwards compatibility
  certificate_id?: string;
  recipient_name?: string;
  course_name?: string | null;
  issued_at?: string;
  expiry_date?: string | null;
  status?: string;
  company_name?: string;
  company_logo?: string | null;
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
