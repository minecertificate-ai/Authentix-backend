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

      // Verifications today
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

    return {
      totalCertificates: certificates.count || 0,
      pendingJobs: pendingJobs.count || 0,
      verificationsToday: verifications.count || 0,
      revokedCertificates: revoked.count || 0,
    };
  }

  /**
   * Get recent imports
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

    if (error) {
      throw new Error(`Failed to fetch recent imports: ${error.message}`);
    }

    return (data ?? []).map((item: any) => ({
      id: item.id,
      // Derive display name from file metadata; fall back to path if original_name is missing
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

    if (error) {
      throw new Error(`Failed to fetch recent verifications: ${error.message}`);
    }

    return (data ?? []).map((item: any) => ({
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
