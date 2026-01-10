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
  async getStats(companyId: string): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [certificates, pendingJobs, verifications, revoked] = await Promise.all([
      // Total certificates
      this.supabase
        .from('certificates')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Pending jobs
      this.supabase
        .from('import_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['queued', 'processing'])
        .is('deleted_at', null),

      // Verifications today
      this.supabase
        .from('verification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('verified_at', todayISO),

      // Revoked certificates
      this.supabase
        .from('certificates')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'revoked')
        .is('deleted_at', null),
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
  async getRecentImports(companyId: string, limit: number = 5): Promise<RecentImport[]> {
    const { data, error } = await this.supabase
      .from('import_jobs')
      .select('id, file_name, status, total_rows, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent imports: ${error.message}`);
    }

    return (data ?? []) as RecentImport[];
  }

  /**
   * Get recent verifications
   */
  async getRecentVerifications(companyId: string, limit: number = 5): Promise<RecentVerification[]> {
    const { data, error } = await this.supabase
      .from('verification_logs')
      .select(`
        id,
        result,
        verified_at,
        certificates (
          recipient_name,
          course_name
        )
      `)
      .eq('company_id', companyId)
      .order('verified_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent verifications: ${error.message}`);
    }

    return (data ?? []).map((item: any) => ({
      id: item.id,
      result: item.result,
      verified_at: item.verified_at,
      certificate: item.certificates ? {
        recipient_name: item.certificates.recipient_name,
        course_name: item.certificates.course_name,
      } : null,
    })) as RecentVerification[];
  }
}
