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
   * Get user profile with company info
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        company_id,
        companies:company_id (
          name,
          logo
        )
      `)
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      company_id: data.company_id,
      company: (data as any).companies ? {
        name: (data as any).companies.name,
        logo: (data as any).companies.logo,
      } : null,
    };
  }
}
