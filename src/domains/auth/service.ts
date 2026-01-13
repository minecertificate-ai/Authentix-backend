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
  async verifySession(accessToken: string): Promise<SessionResponse & { email_verified?: boolean }> {
    // Create a client with the access token
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return { user: null, valid: false, email_verified: false };
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
      return { user: null, valid: false, email_verified: false };
    }

    // Get user profile using service role client for database access
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const serviceClient = getSupabaseClient();
    
    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();

    const fullName = userProfile
      ? `${(userProfile as any).first_name || ''} ${(userProfile as any).last_name || ''}`.trim() || null
      : null;

    return {
      user: {
        id: user.id,
        email: user.email || '',
        full_name: fullName,
      },
      valid: true,
      email_verified: !!user.email_confirmed_at,
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
    const crypto = await import('node:crypto');
    const { getSupabaseClient } = await import('../../lib/supabase/client.js');
    const supabase = getSupabaseClient();

    console.log(`[Bootstrap] Starting bootstrap for user_id: ${userId}`);

    // Check if user already has an active organization
    const { data: existingMembership, error: membershipCheckError } = await supabase
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
          trial_started_at,
          trial_ends_at,
          trial_free_certificates_limit,
          trial_free_certificates_used
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();

    if (membershipCheckError) {
      console.error(`[Bootstrap] Error checking membership: ${membershipCheckError.message}`, membershipCheckError);
    }

    if (existingMembership) {
      console.log(`[Bootstrap] User already has membership, returning existing data. membership_id: ${existingMembership.id}, org_id: ${(existingMembership as any).organization_id}`);
      // User already bootstrapped - return existing data
      const org = (existingMembership as any).organizations;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, created_at')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error(`[Bootstrap] Error fetching profile: ${profileError.message}`, profileError);
      }

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
          start_at: org.trial_started_at || new Date().toISOString(),
          end_at: org.trial_ends_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          free_certificates: org.trial_free_certificates_limit || 10,
        },
      };
    }

    console.log(`[Bootstrap] No existing membership found, proceeding with bootstrap creation`);

    // Get user metadata from auth
    const { data: { user: authUser }, error: authUserError } = await supabase.auth.admin.getUserById(userId);
    if (authUserError) {
      console.error(`[Bootstrap] Error fetching auth user: ${authUserError.message}`, authUserError);
      throw new ValidationError(`Failed to fetch user: ${authUserError.message}`);
    }
    if (!authUser) {
      console.error(`[Bootstrap] User not found in auth.users: ${userId}`);
      throw new ValidationError('User not found');
    }

    console.log(`[Bootstrap] Auth user found: ${authUser.email}, verified: ${!!authUser.email_confirmed_at}`);

    const fullName = (authUser.user_metadata?.full_name as string) || '';
    const companyName = (authUser.user_metadata?.company_name as string) || authUser.email?.split('@')[0] || 'My Organization';
    const [firstName, ...lastNameParts] = fullName.split(' ');
    const lastName = lastNameParts.join(' ');

    console.log(`[Bootstrap] Extracted metadata - full_name: "${fullName}", company_name: "${companyName}"`);

    // Create profile if it doesn't exist
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error(`[Bootstrap] Error checking profile: ${profileCheckError.message}`, profileCheckError);
    }

    if (!existingProfile) {
      console.log(`[Bootstrap] Creating profile for user_id: ${userId}`);
      const { error: profileInsertError } = await supabase.from('profiles').insert({
        id: userId,
        first_name: firstName || 'User',
        last_name: lastName || '',
        email: authUser.email,
      } as any);

      if (profileInsertError) {
        console.error(`[Bootstrap] Error creating profile: ${profileInsertError.message}`, profileInsertError);
        throw new Error(`Failed to create profile: ${profileInsertError.message}`);
      }
      console.log(`[Bootstrap] Profile created successfully`);
    } else {
      console.log(`[Bootstrap] Profile already exists`);
    }

    // Generate unique slug for organization
    const baseSlugRaw = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Fallback to a non-empty base slug
    const baseSlug = baseSlugRaw || 'org';

    let slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    let suffix = 1;

    while (true) {
      const { data: existing, error: slugCheckError } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (slugCheckError && slugCheckError.code !== 'PGRST116') {
        console.error(`[Bootstrap] Error checking slug: ${slugCheckError.message}`, slugCheckError);
      }

      if (!existing) break;
      slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}-${suffix++}`;
    }

    console.log(`[Bootstrap] Generated unique slug: ${slug}`);

    // Generate unique application_id
    const { generateApplicationId } = await import('../../lib/utils/ids.js');
    const applicationId = generateApplicationId();
    console.log(`[Bootstrap] Generated application_id: ${applicationId}`);

    // Create organization with trial
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    console.log(`[Bootstrap] Creating organization: name="${companyName}", slug="${slug}"`);
    
    // Build insert payload with only existing columns
    const orgInsertPayload = {
      name: companyName,
      slug,
      application_id: applicationId,
      email: authUser.email,
      billing_status: 'trialing',
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      trial_free_certificates_limit: 10,
      trial_free_certificates_used: 0,
    };
    
    console.log(`[Bootstrap] Organization insert payload keys:`, Object.keys(orgInsertPayload));
    
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert(orgInsertPayload)
      .select()
      .single();

    if (orgError) {
      console.error(`[Bootstrap] Error creating organization: ${orgError.message}`, orgError);
      console.error(`[Bootstrap] Error details:`, JSON.stringify(orgError, null, 2));
      console.error(`[Bootstrap] Insert payload keys that failed:`, Object.keys(orgInsertPayload));
      throw new Error(`Failed to create organization: ${orgError.message}`);
    }
    if (!newOrg) {
      console.error(`[Bootstrap] Organization insert returned no data`);
      throw new Error('Failed to create organization: No data returned');
    }

    console.log(`[Bootstrap] Organization created successfully: org_id=${(newOrg as any).id}`);

    // Ensure system roles exist for this organization
    console.log(`[Bootstrap] Creating system roles for org_id: ${(newOrg as any).id}`);
    const systemRoles = ['owner', 'admin', 'member'];
    for (const roleKey of systemRoles) {
      const { data: existingRole, error: roleCheckError } = await supabase
        .from('organization_roles')
        .select('id')
        .eq('organization_id', (newOrg as any).id)
        .eq('key', roleKey)
        .maybeSingle();

      if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        console.error(`[Bootstrap] Error checking role ${roleKey}: ${roleCheckError.message}`, roleCheckError);
      }

      if (!existingRole) {
        const { error: roleInsertError } = await supabase.from('organization_roles').insert({
          organization_id: (newOrg as any).id,
          key: roleKey,
          name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
          is_system: true,
        } as any);

        if (roleInsertError) {
          console.error(`[Bootstrap] Error creating role ${roleKey}: ${roleInsertError.message}`, roleInsertError);
        } else {
          console.log(`[Bootstrap] Created role: ${roleKey}`);
        }
      }
    }

    // Get owner role
    const { data: ownerRole, error: ownerRoleError } = await supabase
      .from('organization_roles')
      .select('id')
      .eq('organization_id', (newOrg as any).id)
      .eq('key', 'owner')
      .single();

    if (ownerRoleError) {
      console.error(`[Bootstrap] Error fetching owner role: ${ownerRoleError.message}`, ownerRoleError);
      throw new Error(`Failed to find owner role: ${ownerRoleError.message}`);
    }
    if (!ownerRole) {
      console.error(`[Bootstrap] Owner role not found after creation`);
      throw new Error('Failed to find owner role');
    }

    console.log(`[Bootstrap] Owner role found: role_id=${(ownerRole as any).id}`);

    // Generate unique username
    const baseUsername = authUser.email?.split('@')[0] || 'user';
    let username = baseUsername;
    let usernameSuffix = 1;

    while (true) {
      const { data: existingUsername, error: usernameCheckError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', (newOrg as any).id)
        .eq('username', username)
        .maybeSingle();

      if (usernameCheckError && usernameCheckError.code !== 'PGRST116') {
        console.error(`[Bootstrap] Error checking username: ${usernameCheckError.message}`, usernameCheckError);
      }

      if (!existingUsername) break;
      username = `${baseUsername}${usernameSuffix++}`;
    }

    console.log(`[Bootstrap] Generated unique username: ${username}`);

    // Create membership
    console.log(`[Bootstrap] Creating membership: user_id=${userId}, org_id=${(newOrg as any).id}, role_id=${(ownerRole as any).id}`);
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

    if (memberError) {
      console.error(`[Bootstrap] Error creating membership: ${memberError.message}`, memberError);
      console.error(`[Bootstrap] Error details:`, JSON.stringify(memberError, null, 2));
      throw new Error(`Failed to create membership: ${memberError.message}`);
    }
    if (!newMembership) {
      console.error(`[Bootstrap] Membership insert returned no data`);
      throw new Error('Failed to create membership: No data returned');
    }

    console.log(`[Bootstrap] Membership created successfully: membership_id=${(newMembership as any).id}`);

    // Write audit logs
    console.log(`[Bootstrap] Writing audit logs`);
    const { error: auditError } = await supabase.from('app_audit_logs').insert([
      {
        organization_id: (newOrg as any).id,
        actor_user_id: userId,
        action: 'org.created',
        entity_type: 'organization',
        entity_id: (newOrg as any).id,
        metadata: { name: companyName, slug },
      },
      {
        organization_id: (newOrg as any).id,
        actor_user_id: userId,
        action: 'member.joined',
        entity_type: 'organization_member',
        entity_id: (newMembership as any).id,
        metadata: { role: 'owner', username },
      },
    ] as any);

    if (auditError) {
      console.warn(`[Bootstrap] Error writing audit logs (non-fatal): ${auditError.message}`, auditError);
    } else {
      console.log(`[Bootstrap] Audit logs written successfully`);
    }

    // Get profile
    const { data: profile, error: profileFetchError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, created_at')
      .eq('id', userId)
      .single();

    if (profileFetchError) {
      console.error(`[Bootstrap] Error fetching profile: ${profileFetchError.message}`, profileFetchError);
    }

    console.log(`[Bootstrap] Bootstrap completed successfully for user_id: ${userId}`);

    return {
      organization: newOrg,
      membership: newMembership,
      user: profile,
      trial: {
        start_at: (newOrg as any).trial_started_at || trialStart.toISOString(),
        end_at: (newOrg as any).trial_ends_at || trialEnd.toISOString(),
        free_certificates: (newOrg as any).trial_free_certificates_limit || 10,
      },
    };
  }
}
