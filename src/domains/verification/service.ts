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
   * Returns enhanced response with full certificate and organization details.
   */
  async verifyCertificate(
    token: string,
    requestInfo?: {
      ip?: string;
      userAgent?: string;
    }
  ): Promise<VerificationResult> {
    // Try enhanced RPC function first, fallback to original
    let data: any;
    let error: any;

    // Try the enhanced function
    const enhancedResult = await this.supabase.rpc('verify_certificate_enhanced', {
      p_token: token,
    });

    if (enhancedResult.error) {
      // Fallback to original function if enhanced doesn't exist
      const originalResult = await this.supabase.rpc('verify_certificate', {
        token,
      });
      data = originalResult.data;
      error = originalResult.error;
    } else {
      data = enhancedResult.data;
      error = enhancedResult.error;
    }

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

    // Generate signed URLs for logo and preview if available
    let logoUrl: string | null = null;
    let previewUrl: string | null = null;

    if (cert.organization_logo_bucket && cert.organization_logo_path) {
      try {
        const { data: logoData } = await this.supabase.storage
          .from(cert.organization_logo_bucket)
          .createSignedUrl(cert.organization_logo_path, 3600);
        logoUrl = logoData?.signedUrl ?? null;
      } catch {
        // Ignore URL generation errors
      }
    }

    if (cert.preview_bucket && cert.preview_path) {
      try {
        const { data: previewData } = await this.supabase.storage
          .from(cert.preview_bucket)
          .createSignedUrl(cert.preview_path, 3600);
        previewUrl = previewData?.signedUrl ?? null;
      } catch {
        // Ignore preview URL errors
      }
    }

    // Build enhanced response
    const response: VerificationResult = {
      valid: result === 'valid',
      result: result as 'valid' | 'revoked' | 'expired' | 'not_found',
      message: this.getVerificationMessage(result),

      // Enhanced certificate details
      certificate: cert.certificate_id ? {
        id: cert.certificate_id,
        certificate_number: cert.certificate_number || '',
        recipient_name: cert.recipient_name || '',
        recipient_email: cert.recipient_email || null,
        category_name: cert.category_name || '',
        subcategory_name: cert.subcategory_name || cert.course_name || '',
        issued_at: cert.issued_at,
        expires_at: cert.expires_at || cert.expiry_date || null,
        status: cert.status || 'issued',
        revoked_at: cert.revoked_at || null,
        revoked_reason: cert.revoked_reason || null,
      } : undefined,

      // Enhanced organization details
      organization: cert.organization_id ? {
        id: cert.organization_id,
        name: cert.organization_name || cert.company_name || '',
        slug: cert.organization_slug || '',
        logo_url: logoUrl,
        website_url: cert.organization_website || null,
      } : undefined,

      // Preview URL
      preview_url: previewUrl,

      // Legacy fields for backwards compatibility
      certificate_id: cert.certificate_id,
      recipient_name: cert.recipient_name,
      course_name: cert.course_name || cert.subcategory_name,
      issued_at: cert.issued_at,
      expiry_date: cert.expiry_date || cert.expires_at,
      status: cert.status,
      company_name: cert.company_name || cert.organization_name,
      company_logo: logoUrl || cert.company_logo,
    };

    return response;
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
