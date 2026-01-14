/**
 * VERIFICATION SERVICE
 *
 * Business logic for certificate verification.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VerificationResult } from './types.js';

export class VerificationService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Verify certificate by token
   *
   * Uses Supabase RPC function for verification.
   */
  async verifyCertificate(
    token: string,
    requestInfo?: {
      ip?: string;
      userAgent?: string;
    }
  ): Promise<VerificationResult> {
    // Call Supabase RPC function
    const { data, error } = await this.supabase.rpc('verify_certificate', {
      token,
    });

    if (error) {
      return {
        valid: false,
        result: 'not_found',
        message: 'Certificate not found or invalid token',
      };
    }

    if (!data || data.length === 0) {
      return {
        valid: false,
        result: 'not_found',
        message: 'Certificate not found',
      };
    }

    const cert = data[0]!;
    const result = cert.result as string;

    // Log verification attempt using new certificate_verification_events table
    if (cert.certificate_id) {
      await this.logVerification({
        certificate_id: cert.certificate_id,
        result,
        verifier_ip: requestInfo?.ip ?? null,
        verifier_user_agent: requestInfo?.userAgent ?? null,
      });
    }

    return {
      valid: result === 'valid',
      certificate_id: cert.certificate_id,
      recipient_name: cert.recipient_name,
      course_name: cert.course_name,
      issued_at: cert.issued_at,
      expiry_date: cert.expiry_date,
      status: cert.status,
      company_name: cert.company_name,
      company_logo: cert.company_logo,
      result: result as 'valid' | 'revoked' | 'expired' | 'not_found',
      message: this.getVerificationMessage(result),
    };
  }

  /**
   * Log verification attempt
   */
  private async logVerification(log: {
    certificate_id: string;
    result: string;
    verifier_ip: string | null;
    verifier_user_agent: string | null;
  }): Promise<void> {
    // Get organization_id from certificate
    const { data: cert } = await this.supabase
      .from('certificates')
      .select('organization_id')
      .eq('id', log.certificate_id)
      .single();

    if (!cert) {
      return; // Certificate not found, skip logging
    }

    await this.supabase.from('certificate_verification_events').insert({
      organization_id: cert.organization_id,
      certificate_id: log.certificate_id,
      result: log.result,
      ip_hash: log.verifier_ip,
      user_agent: log.verifier_user_agent,
      scanned_at: new Date().toISOString(),
    });
  }

  /**
   * Get verification message
   */
  private getVerificationMessage(result: string): string {
    const messages: Record<string, string> = {
      valid: 'This certificate is valid and authentic',
      revoked: 'This certificate has been revoked',
      expired: 'This certificate has expired',
      not_found: 'Certificate not found or invalid token',
    };

    return messages[result] ?? 'Unknown verification result';
  }
}
