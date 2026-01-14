/**
 * DASHBOARD SERVICE
 *
 * Business logic layer for dashboard data.
 * Uses caching to reduce database queries (250ms → 2ms for cached loads).
 */

import type { DashboardRepository } from './repository.js';
import type { DashboardData } from './types.js';
import { getCachedDashboard, setCachedDashboard } from '../../lib/cache/dashboard-cache.js';

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  /**
   * Get dashboard data
   * Uses cache-first approach to reduce DB queries from 6 to 0 for cached loads
   */
  async getDashboardData(organizationId: string): Promise<DashboardData> {
    // Check cache first
    const cached = getCachedDashboard(organizationId);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    // Ensure partial failures don't break the entire dashboard
    let stats: DashboardData['stats'] = {
      totalCertificates: 0,
      pendingJobs: 0,
      verificationsToday: 0,
      revokedCertificates: 0,
    };
    let recentImports: DashboardData['recentImports'] = [];
    let recentVerifications: DashboardData['recentVerifications'] = [];

    try {
      stats = await this.repository.getStats(organizationId);
    } catch (error) {
      // Log and continue with defaults
      // (logger is provided via Fastify; here we just swallow to avoid tight coupling)
      console.error('[Dashboard] Failed to fetch stats', error);
    }

    try {
      recentImports = await this.repository.getRecentImports(organizationId);
    } catch (error) {
      console.error('[Dashboard] Failed to fetch recent imports', error);
    }

    try {
      recentVerifications = await this.repository.getRecentVerifications(organizationId);
    } catch (error) {
      console.error('[Dashboard] Failed to fetch recent verifications', error);
    }

    const dashboardData: DashboardData = {
      stats,
      recentImports,
      recentVerifications,
    };

    // Cache the result
    setCachedDashboard(organizationId, dashboardData);

    return dashboardData;
  }
}
