/**
 * DASHBOARD TYPES
 *
 * Types for dashboard statistics and activity data.
 */

export interface DashboardStats {
  totalCertificates: number;
  pendingJobs: number;
  verificationsToday: number;
  revokedCertificates: number;
}

export interface RecentImport {
  id: string;
  file_name: string | null;
  status: string;
  total_rows: number;
  created_at: string;
}

export interface RecentVerification {
  id: string;
  result: string;
  verified_at: string;
  certificate: {
    recipient_name: string;
    course_name: string | null;
  } | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recentImports: RecentImport[];
  recentVerifications: RecentVerification[];
}
