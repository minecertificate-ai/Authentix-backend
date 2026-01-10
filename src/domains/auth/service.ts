/**
 * AUTH SERVICE
 *
 * Business logic layer for authentication.
 */

import { createClient } from '@supabase/supabase-js';
import type { LoginDTO, SignupDTO, AuthResponse, SessionResponse } from './types.js';
import { ValidationError } from '../../lib/errors/handler.js';

/**
 * Get Supabase anon client for auth operations
 */
function getAnonClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export class AuthService {
  private get supabase() {
    return getAnonClient();
  }

  /**
   * Validate email domain (reject personal email domains)
   */
  private validateEmailDomain(email: string): boolean {
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'zoho.com', 'yandex.com', 'gmx.com', 'live.com', 'msn.com'
    ];

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    return !personalDomains.includes(domain);
  }

  /**
   * Login user
   */
  async login(dto: LoginDTO): Promise<AuthResponse> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    if (!data.session || !data.user) {
      throw new ValidationError('Failed to create session');
    }

    // Get user profile using service role client for database access
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const serviceClient = getSupabaseClient();
    
    const { data: userProfile } = await serviceClient
      .from('users')
      .select('full_name')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email || '',
        full_name: (userProfile as { full_name: string | null } | null)?.full_name || null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at || 0,
      },
    };
  }

  /**
   * Signup user
   */
  async signup(dto: SignupDTO): Promise<AuthResponse> {
    // Validate email domain
    if (!this.validateEmailDomain(dto.email)) {
      throw new ValidationError(
        'Please use a company email. Personal email domains (gmail, yahoo, etc.) are not allowed.'
      );
    }

    const { data, error } = await this.supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          full_name: dto.full_name,
          company_name: dto.company_name,
        },
      },
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    if (!data.session || !data.user) {
      throw new ValidationError('Failed to create session');
    }

    // Get user profile using service role client for database access
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const serviceClient = getSupabaseClient();
    
    const { data: userProfile } = await serviceClient
      .from('users')
      .select('full_name')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email || '',
        full_name: (userProfile as { full_name: string | null } | null)?.full_name || null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at || 0,
      },
    };
  }

  /**
   * Verify session token
   */
  async verifySession(accessToken: string): Promise<SessionResponse> {
    // Create a client with the access token
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return { user: null, valid: false };
    }

    const client = createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
      return { user: null, valid: false };
    }

    // Get user profile using service role client for database access
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const serviceClient = getSupabaseClient();
    
    const { data: userProfile } = await serviceClient
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();

    return {
      user: {
        id: user.id,
        email: user.email || '',
        full_name: (userProfile as { full_name: string | null } | null)?.full_name || null,
      },
      valid: true,
    };
  }

  /**
   * Logout user (invalidate session)
   */
  async logout(_accessToken: string): Promise<void> {
    // Note: Supabase doesn't support server-side logout with token
    // The token will expire naturally
    // In a production system, you might want to maintain a token blacklist
  }
}
