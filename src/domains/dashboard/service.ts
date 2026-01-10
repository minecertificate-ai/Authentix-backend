/**
 * DASHBOARD SERVICE
 *
 * Business logic layer for dashboard data.
 */

import type { DashboardRepository } from './repository.js';
import type { DashboardData } from './types.js';

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  /**
   * Get dashboard data
   */
  async getDashboardData(companyId: string): Promise<DashboardData> {
    const [stats, recentImports, recentVerifications] = await Promise.all([
      this.repository.getStats(companyId),
      this.repository.getRecentImports(companyId),
      this.repository.getRecentVerifications(companyId),
    ]);

    return {
      stats,
      recentImports,
      recentVerifications,
    };
  }
}
