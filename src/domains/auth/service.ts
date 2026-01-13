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
   * Blocks login if email is not verified
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

    // Check email verification status
    if (!data.user.email_confirmed_at) {
      throw new ValidationError('Please verify your email to continue', { code: 'EMAIL_NOT_VERIFIED' });
    }

    // Get user profile using service role client for database access
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const serviceClient = getSupabaseClient();

    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', data.user.id)
      .maybeSingle();

    return {
      user: {
        id: data.user.id,
        email: data.user.email || '',
        full_name: userProfile
          ? `${(userProfile as any).first_name || ''} ${(userProfile as any).last_name || ''}`.trim() || null
          : null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at || 0,
      },
    };
  }

  /**
   * Signup user - sends verification email
   * Returns success message WITHOUT session (user must verify email first)
   */
  async signup(dto: SignupDTO): Promise<{ message: string }> {
    // Validate email domain
    if (!this.validateEmailDomain(dto.email)) {
      throw new ValidationError(
        'Please use a company email. Personal email domains (gmail, yahoo, etc.) are not allowed.'
      );
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const emailRedirectTo = `${frontendUrl}/auth/callback`;

    const { data, error } = await this.supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: dto.full_name,
          company_name: dto.company_name,
        },
      },
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    if (!data.user) {
      throw new ValidationError('Failed to create user');
    }

    // Return success message - NO SESSION until email is verified
    return {
      message: 'verification_email_sent',
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

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const { error } = await this.supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`,
      },
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    return {
      message: 'verification_email_sent',
    };
  }

  /**
   * Bootstrap user after verification
   * Creates organization, profile, and membership (idempotent)
   */
  async bootstrap(userId: string): Promise<{
    organization: any;
    membership: any;
    user: any;
    trial: { start_at: string; end_at: string; free_certificates: number };
  }> {
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const supabase = getSupabaseClient();

    // Check if user already has an active organization
    const { data: existingMembership } = await supabase
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
          trial_start,
          trial_end,
          free_certificates_included
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();

    if (existingMembership) {
      // User already bootstrapped - return existing data
      const org = (existingMembership as any).organizations;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, created_at')
        .eq('id', userId)
        .single();

      const membership = existingMembership as any;

      return {
        organization: org,
        membership: {
          id: membership.id,
          organization_id: membership.organization_id,
          username: membership.username,
          role_id: membership.role_id,
          status: membership.status,
        },
        user: profile,
        trial: {
          start_at: org.trial_start,
          end_at: org.trial_end,
          free_certificates: org.free_certificates_included || 10,
        },
      };
    }

    // Get user metadata from auth
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
    if (!authUser) {
      throw new ValidationError('User not found');
    }

    const fullName = (authUser.user_metadata?.full_name as string) || '';
    const companyName = (authUser.user_metadata?.company_name as string) || authUser.email?.split('@')[0] || 'My Organization';
    const [firstName, ...lastNameParts] = fullName.split(' ');
    const lastName = lastNameParts.join(' ');

    // Create profile if it doesn't exist
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: userId,
        first_name: firstName || 'User',
        last_name: lastName || '',
        email: authUser.email,
      } as any);
    }

    // Generate unique slug for organization
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (!existing) break;
      slug = `${baseSlug}-${suffix++}`;
    }

    // Generate unique application_id
    const { generateApplicationId } = await import('../../lib/utils/ids.js');
    const applicationId = generateApplicationId();

    // Create organization with trial
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: companyName,
        slug,
        application_id: applicationId,
        email: authUser.email,
        billing_status: 'trial',
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
        free_certificates_included: 10,
      } as any)
      .select()
      .single();

    if (orgError || !newOrg) {
      throw new Error(`Failed to create organization: ${orgError?.message}`);
    }

    // Ensure system roles exist for this organization
    const systemRoles = ['owner', 'admin', 'member'];
    for (const roleKey of systemRoles) {
      const { data: existingRole } = await supabase
        .from('organization_roles')
        .select('id')
        .eq('organization_id', (newOrg as any).id)
        .eq('key', roleKey)
        .maybeSingle();

      if (!existingRole) {
        await supabase.from('organization_roles').insert({
          organization_id: (newOrg as any).id,
          key: roleKey,
          name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
          is_system: true,
        } as any);
      }
    }

    // Get owner role
    const { data: ownerRole } = await supabase
      .from('organization_roles')
      .select('id')
      .eq('organization_id', (newOrg as any).id)
      .eq('key', 'owner')
      .single();

    if (!ownerRole) {
      throw new Error('Failed to find owner role');
    }

    // Generate unique username
    const baseUsername = authUser.email?.split('@')[0] || 'user';
    let username = baseUsername;
    let usernameSuffix = 1;

    while (true) {
      const { data: existingUsername } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', (newOrg as any).id)
        .eq('username', username)
        .maybeSingle();

      if (!existingUsername) break;
      username = `${baseUsername}${usernameSuffix++}`;
    }

    // Create membership
    const { data: newMembership, error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: (newOrg as any).id,
        user_id: userId,
        username,
        role_id: (ownerRole as any).id,
        status: 'active',
      } as any)
      .select()
      .single();

    if (memberError || !newMembership) {
      throw new Error(`Failed to create membership: ${memberError?.message}`);
    }

    // Write audit logs
    await supabase.from('app_audit_logs').insert([
      {
        organization_id: (newOrg as any).id,
        user_id: userId,
        action: 'org.created',
        resource_type: 'organization',
        resource_id: (newOrg as any).id,
        metadata: { name: companyName, slug },
      },
      {
        organization_id: (newOrg as any).id,
        user_id: userId,
        action: 'member.joined',
        resource_type: 'organization_member',
        resource_id: (newMembership as any).id,
        metadata: { role: 'owner', username },
      },
    ] as any);

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, created_at')
      .eq('id', userId)
      .single();

    return {
      organization: newOrg,
      membership: newMembership,
      user: profile,
      trial: {
        start_at: trialStart.toISOString(),
        end_at: trialEnd.toISOString(),
        free_certificates: 10,
      },
    };
  }
}
