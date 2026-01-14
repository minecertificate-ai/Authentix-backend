/**
 * DASHBOARD REPOSITORY
 *
 * Data access layer for dashboard statistics.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardStats, RecentImport, RecentVerification } from './types.js';

export class DashboardRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get dashboard statistics
   * Returns zero counts for new orgs (never throws for "no data")
   */
  async getStats(organizationId: string): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [certificates, pendingJobs, verifications, revoked] = await Promise.all([
      // Total certificates
      this.supabase
        .from('certificates')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),

      // Pending jobs
      this.supabase
        .from('file_import_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['queued', 'processing']),

      // Verifications today - using certificate_verification_events (not verification_logs)
      this.supabase
        .from('certificate_verification_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('scanned_at', todayISO),

      // Revoked certificates
      this.supabase
        .from('certificates')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'revoked'),
    ]);

    // Handle errors gracefully - return zeros instead of throwing
    // PGRST116 = no rows found (expected for new orgs)
    const handleCountResult = (result: any, metricName: string) => {
      if (result.error && result.error.code !== 'PGRST116') {
        console.error(`[DashboardRepository.getStats] Error fetching ${metricName}:`, {
          step: `fetch_${metricName}`,
          organization_id: organizationId,
          error_message: result.error.message,
          error_code: result.error.code,
        });
        return 0; // Return 0 on error instead of throwing
      }
      return result.count || 0;
    };

    return {
      totalCertificates: handleCountResult(certificates, 'total_certificates'),
      pendingJobs: handleCountResult(pendingJobs, 'pending_jobs'),
      verificationsToday: handleCountResult(verifications, 'verifications_today'),
      revokedCertificates: handleCountResult(revoked, 'revoked_certificates'),
    };
  }

  /**
   * Get recent imports
   * Joins files table via source_file_id to get file_name (file_import_jobs.file_name doesn't exist)
   * Returns empty array for new orgs (never throws for "no data")
   */
  async getRecentImports(organizationId: string, limit: number = 5): Promise<RecentImport[]> {
    const { data, error } = await this.supabase
      .from('file_import_jobs')
      .select(`
        id,
        status,
        row_count,
        created_at,
        source_file:source_file_id (
          id,
          original_name,
          path
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // PGRST116 = no rows found (expected for new orgs)
    if (error && error.code !== 'PGRST116') {
      const errorMessage = `[DashboardRepository.getRecentImports] Failed to fetch recent imports: ${error.message}`;
      console.error(errorMessage, {
        step: 'fetch_recent_imports',
        organization_id: organizationId,
        error_code: error.code,
        error_details: error.details,
      });
      throw new Error(`${errorMessage} (PostgREST code: ${error.code || 'unknown'})`);
    }

    // Return empty array if no data (new orgs)
    if (!data || data.length === 0) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      // Derive display name from file metadata via join; fall back to path if original_name is missing
      // file_import_jobs.file_name doesn't exist - must use files.original_name via source_file_id
      file_name: item.source_file
        ? (item.source_file.original_name || item.source_file.path || null)
        : null,
      status: item.status,
      total_rows: item.row_count ?? 0,
      created_at: item.created_at,
    })) as RecentImport[];
  }

  /**
   * Get recent verifications
   * Uses certificate_verification_events (not verification_logs)
   * Returns empty array for new orgs (never throws for "no data")
   */
  async getRecentVerifications(organizationId: string, limit: number = 5): Promise<RecentVerification[]> {
    const { data, error } = await this.supabase
      .from('certificate_verification_events')
      .select(`
        id,
        result,
        scanned_at,
        certificates:certificate_id (
          recipient_name,
          certificate_number
        )
      `)
      .eq('organization_id', organizationId)
      .order('scanned_at', { ascending: false })
      .limit(limit);

    // PGRST116 = no rows found (expected for new orgs)
    if (error && error.code !== 'PGRST116') {
      const errorMessage = `[DashboardRepository.getRecentVerifications] Failed to fetch recent verifications: ${error.message}`;
      console.error(errorMessage, {
        step: 'fetch_recent_verifications',
        organization_id: organizationId,
        error_code: error.code,
        error_details: error.details,
      });
      throw new Error(`${errorMessage} (PostgREST code: ${error.code || 'unknown'})`);
    }

    // Return empty array if no data (new orgs)
    if (!data || data.length === 0) {
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      result: item.result,
      verified_at: item.scanned_at,
      certificate: item.certificates
        ? {
            recipient_name: item.certificates.recipient_name,
            certificate_number: item.certificates.certificate_number,
          }
        : null,
    })) as RecentVerification[];
  }
}
