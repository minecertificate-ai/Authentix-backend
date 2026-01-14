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
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    // Get profile
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to get user profile: ${profileError.message}`);
    }

    if (!profile) {
      return null;
    }

    // Get active organization membership
    const { data: membership, error: memberError } = await this.supabase
      .from('organization_members')
      .select(`
        id,
        organization_id,
        username,
        role_id,
        status,
        organizations:organization_id (
          id,
          name,
          slug,
          application_id,
          billing_status,
          industry_id,
          logo_file_id
        ),
        organization_roles:role_id (
          id,
          key
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();

    if (memberError && memberError.code !== 'PGRST116') {
      throw new Error(`Failed to get organization membership: ${memberError.message}`);
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
      organization: membership
        ? {
            id: (membership as any).organizations.id,
            name: (membership as any).organizations.name,
            slug: (membership as any).organizations.slug,
            application_id: (membership as any).organizations.application_id,
            billing_status: (membership as any).organizations.billing_status,
            industry_id: (membership as any).organizations.industry_id,
            logo_file_id: (membership as any).organizations.logo_file_id ?? null,
          }
        : null,
      membership: membership
        ? {
            id: membership.id,
            organization_id: membership.organization_id,
            username: membership.username,
            role_id: membership.role_id,
            role_key: (membership as any).organization_roles?.key || 'member',
            status: membership.status,
          }
        : null,
    };
  }
}
