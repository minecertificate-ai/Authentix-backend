/**
 * USER REPOSITORY
 *
 * Data access layer for user profile management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from './types.js';

export class UserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get user profile with organization info
   * Consolidates queries to avoid N+1: single query with joins for membership + org + role
   * Handles missing optional fields gracefully (logo, etc.)
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    // Get profile
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`[UserRepository.getProfile] Failed to get user profile: ${profileError.message} (PostgREST code: ${profileError.code || 'unknown'})`);
    }

    if (!profile) {
      return null;
    }

    // Get active organization membership with organization and role info in a single query
    // Use explicit column selection to avoid schema mismatches
    const { data: membership, error: memberError } = await this.supabase
      .from('organization_members')
      .select(`
        id,
        organization_id,
        username,
        role_id,
        status,
        organizations!inner (
          id,
          name,
          slug,
          application_id,
          billing_status,
          industry_id,
          logo_file_id
        ),
        organization_roles (
          id,
          key
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();

    // PGRST116 = no rows found (expected if user has no membership)
    if (memberError && memberError.code !== 'PGRST116') {
      throw new Error(`[UserRepository.getProfile] Failed to get organization membership: ${memberError.message} (PostgREST code: ${memberError.code || 'unknown'})`);
    }

    // If no membership, return profile without organization
    if (!membership) {
      const fullName = profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.first_name || profile.last_name || null;

      return {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: fullName,
        organization: null,
        membership: null,
      };
    }

    // Safely extract nested organization data
    const orgData = (membership as any).organizations;
    const roleData = (membership as any).organization_roles;

    if (!orgData) {
      // This should not happen with !inner, but handle gracefully
      throw new Error(`[UserRepository.getProfile] Organization data missing for membership_id=${membership.id}`);
    }

    // Fetch logo file separately if logo_file_id exists
    // This avoids N+1 by only fetching when needed (logo is optional)
    let logoFile: { id: string; bucket: string; path: string } | null = null;
    if (orgData.logo_file_id) {
      const { data: file, error: fileError } = await this.supabase
        .from('files')
        .select('id, bucket, path')
        .eq('id', orgData.logo_file_id)
        .maybeSingle();

      // Logo fetch errors are non-fatal - just log and continue
      if (fileError) {
        console.warn(`[UserRepository.getProfile] Failed to fetch logo file (non-fatal): ${fileError.message}`, {
          logo_file_id: orgData.logo_file_id,
          error_code: fileError.code,
        });
      } else if (file) {
        logoFile = {
          id: file.id,
          bucket: file.bucket,
          path: file.path,
        };
      }
    }

    const fullName = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : profile.first_name || profile.last_name || null;

    return {
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      full_name: fullName,
      organization: {
        id: orgData.id,
        name: orgData.name,
        slug: orgData.slug,
        application_id: orgData.application_id,
        billing_status: orgData.billing_status,
        industry_id: orgData.industry_id || null,
        logo: logoFile
          ? {
              file_id: logoFile.id,
              bucket: logoFile.bucket,
              path: logoFile.path,
            }
          : null,
      },
      membership: {
        id: membership.id,
        organization_id: membership.organization_id,
        username: membership.username,
        role_id: membership.role_id,
        role_key: roleData?.key || 'member',
        status: membership.status,
      },
    };
  }
}
