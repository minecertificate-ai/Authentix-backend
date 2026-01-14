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

    /**
     * Helper to ensure profile exists for a user.
     * - profiles.id MUST equal auth.user.id
     * - Idempotent: safe to call multiple times
     */
    const ensureProfileExists = async () => {
      // Check if profile already exists
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle();

      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        // PGRST116 = no rows found (expected if profile doesn't exist)
        const errorMessage = `[Bootstrap Step: Profile Check] Failed to check profile: ${profileCheckError.message}`;
        console.error(errorMessage, {
          step: 'profile_check',
          userId,
          error_code: profileCheckError.code,
          error_details: profileCheckError.details,
        });
        throw new Error(`${errorMessage} (PostgREST code: ${profileCheckError.code || 'unknown'})`);
      }

      if (existingProfile) {
        console.log(
          `[Bootstrap Step: Profile Creation] Profile already exists for user_id=${userId}, skipping creation`
        );
        return existingProfile;
      }

      console.log(
        `[Bootstrap Step: Profile Creation] Creating profile for user_id: ${userId} (ensureProfileExists)`
      );

      // Fetch auth user to populate email / name
      const {
        data: { user: authUserForProfile },
        error: authUserForProfileError,
      } = await supabase.auth.admin.getUserById(userId);

      if (authUserForProfileError) {
        const errorMessage = `[Bootstrap Step: Profile Creation] Failed to fetch auth user: ${authUserForProfileError.message}`;
        console.error(errorMessage, {
          step: 'fetch_auth_user_for_profile',
          userId,
          error_code: authUserForProfileError.status || 'unknown',
        });
        throw new Error(errorMessage);
      }

      if (!authUserForProfile) {
        console.error(
          `[Bootstrap Step: Profile Creation] Auth user not found while creating profile for user_id=${userId}`
        );
        throw new Error('[Bootstrap Step: Profile Creation] User not found in auth.users');
      }

      const fullNameForProfile = (authUserForProfile.user_metadata?.full_name as string) || '';
      const [firstNameForProfile, ...lastNamePartsForProfile] = fullNameForProfile.split(' ');
      const lastNameForProfile = lastNamePartsForProfile.join(' ');

      const { data: insertedProfile, error: profileInsertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          first_name: firstNameForProfile || 'User',
          last_name: lastNameForProfile || '',
          email: authUserForProfile.email,
        } as any)
        .select('id, first_name, last_name, email')
        .single();

      if (profileInsertError) {
        const errorMessage = `[Bootstrap Step: Profile Creation] Failed to create profile: ${profileInsertError.message}`;
        console.error(errorMessage, {
          step: 'profile_creation',
          userId,
          error_code: profileInsertError.code,
          error_details: profileInsertError.details,
          error_hint: profileInsertError.hint,
        });
        throw new Error(`${errorMessage} (PostgREST code: ${profileInsertError.code || 'unknown'})`);
      }

      console.log(
        `[Bootstrap Step: Profile Creation] Profile created successfully for user_id=${userId}`
      );

      return insertedProfile;
    };

    // Check if user already has an active organization (idempotency check)
    console.log(`[Bootstrap Step: Lookup Membership] Checking for existing membership for user_id: ${userId}`);
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

    if (membershipCheckError && membershipCheckError.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected if user has no membership)
      const errorMessage = `[Bootstrap Step: Lookup Membership] Failed to check existing membership: ${membershipCheckError.message}`;
      console.error(errorMessage, {
        step: 'lookup_membership',
        userId,
        error_code: membershipCheckError.code,
        error_details: membershipCheckError.details,
      });
      throw new Error(`${errorMessage} (PostgREST code: ${membershipCheckError.code || 'unknown'})`);
    }

    if (existingMembership) {
      console.log(`[Bootstrap] User already has membership, returning existing data. membership_id: ${existingMembership.id}, org_id: ${(existingMembership as any).organization_id}`);
      // User already bootstrapped - ensure profile exists and return existing data
      const org = (existingMembership as any).organizations;
      const profile = await ensureProfileExists();

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
      const errorMessage = `[Bootstrap Step: Fetch Auth User] Failed to fetch auth user: ${authUserError.message}`;
      console.error(errorMessage, {
        step: 'fetch_auth_user',
        userId,
        error_code: authUserError.status || 'unknown',
      });
      throw new ValidationError(errorMessage);
    }
    if (!authUser) {
      const errorMessage = `[Bootstrap Step: Fetch Auth User] User not found in auth.users: ${userId}`;
      console.error(errorMessage, { step: 'fetch_auth_user', userId });
      throw new ValidationError(errorMessage);
    }

    console.log(`[Bootstrap] Auth user found: ${authUser.email}, verified: ${!!authUser.email_confirmed_at}`);

    const fullName = (authUser.user_metadata?.full_name as string) || '';
    const companyName = (authUser.user_metadata?.company_name as string) || authUser.email?.split('@')[0] || 'My Organization';

    console.log(`[Bootstrap] Extracted metadata - full_name: "${fullName}", company_name: "${companyName}"`);

    // Ensure profile exists before proceeding with organization creation
    await ensureProfileExists();

    // Generate unique slug for organization
    // Slug must be exactly 20 characters, only lowercase letters [a-z]
    // Never accept slug from frontend - always generate server-side
    const { generateOrganizationSlug, generateApplicationId, generateAPIKey, hashAPIKey } = await import('../../lib/utils/ids.js');
    
    let slug = generateOrganizationSlug();
    let slugAttempts = 0;
    const maxSlugAttempts = 10; // Check up to 10 slugs before giving up

    // Check for slug uniqueness (pre-check before insert)
    while (slugAttempts < maxSlugAttempts) {
      const { data: existing, error: slugCheckError } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (slugCheckError && slugCheckError.code !== 'PGRST116') {
        console.error(`[Bootstrap Step: Slug Generation] Error checking slug: ${slugCheckError.message}`, slugCheckError);
      }

      if (!existing) break; // Slug is available
      
      // Regenerate slug if collision found
      slug = generateOrganizationSlug();
      slugAttempts++;
    }

    if (slugAttempts >= maxSlugAttempts) {
      throw new Error('[Bootstrap Step: Slug Generation] Failed to generate unique slug after multiple attempts');
    }

    console.log(`[Bootstrap Step: Slug Generation] Generated unique slug: ${slug} (${slug.length} chars, ${slugAttempts} attempts)`);

    // Generate unique application_id and API key
    // Note: API key is generated once and hashed with SHA-256 before storage
    // The plaintext API key is never stored (only the hash)
    const applicationId = generateApplicationId();
    const apiKey = generateAPIKey();
    const apiKeyHash = await hashAPIKey(apiKey);
    console.log(`[Bootstrap] Generated application_id: ${applicationId}`);
    console.log(`[Bootstrap] Generated API key (hash stored, plaintext discarded for security)`);

    // Create organization with trial
    // Note: trial_started_at has default now(), but we set it explicitly for clarity
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    console.log(`[Bootstrap Step: Organization Creation] Creating organization: name="${companyName}", slug="${slug}"`);
    
    // Build insert payload with ONLY existing columns
    // Required: name, slug, application_id, api_key_hash, billing_address (NOT NULL)
    // Optional: email, billing_status, trial_* fields
    // DO NOT include: api_key_created_at, api_key_last_rotated_at (columns don't exist)
    // DO NOT include: trial_start, trial_end, free_certificates_included (old column names)
    
    // Validate required fields before building payload
    if (!apiKeyHash || typeof apiKeyHash !== 'string') {
      throw new Error('[Bootstrap Step: Organization Creation] api_key_hash is required but was null/undefined');
    }
    if (!applicationId || typeof applicationId !== 'string') {
      throw new Error('[Bootstrap Step: Organization Creation] application_id is required but was null/undefined');
    }
    if (!slug || typeof slug !== 'string' || slug.length !== 20 || !/^[a-z]{20}$/.test(slug)) {
      throw new Error(`[Bootstrap Step: Organization Creation] slug must be exactly 20 lowercase letters, got: "${slug}"`);
    }
    
    // billing_address is required (jsonb, NOT NULL)
    // Set safe default for bootstrap (user hasn't provided billing details yet)
    const billingAddress = {
      source: 'bootstrap',
      status: 'incomplete',
      provided_at: null,
    };
    
    const orgInsertPayload = {
      name: companyName,
      slug,
      application_id: applicationId,
      email: authUser.email,
      billing_status: 'trialing',
      trial_started_at: trialStart.toISOString(), // Explicitly set (default would be now())
      trial_ends_at: trialEnd.toISOString(), // 7 days from now
      trial_free_certificates_limit: 10, // Explicitly set (default would be 10)
      trial_free_certificates_used: 0, // Explicitly set (default would be 0)
      api_key_hash: apiKeyHash, // REQUIRED: NOT NULL, must be set
      billing_address: billingAddress, // REQUIRED: NOT NULL jsonb, set safe default
    };
    
    console.log(`[Bootstrap Step: Organization Creation] Insert payload keys:`, Object.keys(orgInsertPayload));
    console.log(`[Bootstrap Step: Organization Creation] Slug validation: ${slug.length} chars, matches [a-z]{20}: ${/^[a-z]{20}$/.test(slug)}`);
    
    // Insert organization with retry logic for unique violations
    // Note: If you recently changed the database schema, ensure PostgREST schema cache is refreshed
    // Run in Supabase SQL editor: NOTIFY pgrst, 'reload schema';
    // Or restart services to refresh schema cache
    let newOrg: any = null;
    let orgError: any = null;
    let insertAttempts = 0;
    const maxInsertAttempts = 5;
    
    while (insertAttempts < maxInsertAttempts) {
      const result = await supabase
        .from('organizations')
        .insert(orgInsertPayload)
        .select(`
          id,
          name,
          slug,
          application_id,
          email,
          billing_status,
          trial_started_at,
          trial_ends_at,
          trial_free_certificates_limit,
          trial_free_certificates_used,
          api_key_hash,
          billing_address,
          created_at
        `)
        .single();
      
      newOrg = result.data;
      orgError = result.error;
      
      // If successful, break
      if (!orgError && newOrg) {
        break;
      }
      
      // If error is NOT a unique violation, don't retry
      const isUniqueViolation = orgError?.code === '23505' || // PostgreSQL unique violation
                                orgError?.message?.includes('duplicate') ||
                                orgError?.message?.includes('unique') ||
                                orgError?.message?.includes('violates unique constraint');
      
      if (!isUniqueViolation) {
        // Not a unique violation - don't retry, throw immediately
        break;
      }
      
      // Unique violation - regenerate slug and retry
      insertAttempts++;
      console.warn(`[Bootstrap Step: Organization Creation] Unique violation on attempt ${insertAttempts}/${maxInsertAttempts}, regenerating slug...`);
      console.warn(`[Bootstrap Step: Organization Creation] Error: ${orgError.message}, code: ${orgError.code}`);
      
      // Regenerate slug for retry
      slug = generateOrganizationSlug();
      orgInsertPayload.slug = slug;
      
      // Small delay before retry (avoid race conditions)
      await new Promise(resolve => setTimeout(resolve, 100 * insertAttempts));
    }
    
    // Check final result
    if (orgError) {
      const errorDetails = {
        message: orgError.message,
        code: orgError.code,
        details: orgError.details,
        hint: orgError.hint,
        constraint: orgError.code === '23505' ? 'unique_violation' : undefined,
      };
      
      console.error(`[Bootstrap Step: Organization Creation] Error creating organization after ${insertAttempts} attempts:`, errorDetails);
      console.error(`[Bootstrap Step: Organization Creation] Insert payload keys:`, Object.keys(orgInsertPayload));
      console.error(`[Bootstrap Step: Organization Creation] Slug used: "${slug}" (${slug.length} chars)`);
      
      throw new Error(
        `[Bootstrap Step: Organization Creation] Failed to create organization after ${insertAttempts} attempts: ${orgError.message} ` +
        `(Postgres code: ${orgError.code}, constraint: ${errorDetails.constraint || 'unknown'})`
      );
    }
    if (!newOrg) {
      console.error(`[Bootstrap Step: Organization Creation] Organization insert returned no data after ${insertAttempts} attempts`);
      throw new Error(`[Bootstrap Step: Organization Creation] Failed to create organization: No data returned from insert after ${insertAttempts} attempts`);
    }

    console.log(`[Bootstrap] Organization created successfully: org_id=${(newOrg as any).id}`);

    // Ensure system roles exist for this organization
    console.log(`[Bootstrap Step: Roles Seed] Creating system roles for org_id: ${(newOrg as any).id}`);
    const systemRoles = ['owner', 'admin', 'member'];
    for (const roleKey of systemRoles) {
      const { data: existingRole, error: roleCheckError } = await supabase
        .from('organization_roles')
        .select('id')
        .eq('organization_id', (newOrg as any).id)
        .eq('key', roleKey)
        .maybeSingle();

      if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        // PGRST116 = no rows found (expected if role doesn't exist)
        const errorMessage = `[Bootstrap Step: Roles Seed] Failed to check existing role ${roleKey}: ${roleCheckError.message}`;
        console.error(errorMessage, {
          step: 'roles_seed_check',
          role_key: roleKey,
          organization_id: (newOrg as any).id,
          error_code: roleCheckError.code,
          error_details: roleCheckError.details,
        });
        throw new Error(`${errorMessage} (PostgREST code: ${roleCheckError.code || 'unknown'})`);
      }

      if (!existingRole) {
        const { error: roleInsertError } = await supabase.from('organization_roles').insert({
          organization_id: (newOrg as any).id,
          key: roleKey,
          name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
          is_system: true,
        } as any);

        if (roleInsertError) {
          const errorMessage = `[Bootstrap Step: Roles Seed] Failed to create role ${roleKey}: ${roleInsertError.message}`;
          console.error(errorMessage, {
            step: 'roles_seed_create',
            role_key: roleKey,
            organization_id: (newOrg as any).id,
            error_code: roleInsertError.code,
            error_details: roleInsertError.details,
            error_hint: roleInsertError.hint,
          });
          throw new Error(`${errorMessage} (PostgREST code: ${roleInsertError.code || 'unknown'})`);
        } else {
          console.log(`[Bootstrap Step: Roles Seed] Created role: ${roleKey}`);
        }
      } else {
        console.log(`[Bootstrap Step: Roles Seed] Role ${roleKey} already exists, skipping creation`);
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
      const errorMessage = `[Bootstrap Step: Role Lookup] Failed to find owner role: ${ownerRoleError.message}`;
      console.error(errorMessage, {
        step: 'role_lookup_owner',
        organization_id: (newOrg as any).id,
        error_code: ownerRoleError.code,
        error_details: ownerRoleError.details,
      });
      throw new Error(`${errorMessage} (PostgREST code: ${ownerRoleError.code || 'unknown'})`);
    }
    if (!ownerRole) {
      const errorMessage = `[Bootstrap Step: Role Lookup] Owner role not found after creation for org_id=${(newOrg as any).id}`;
      console.error(errorMessage, { step: 'role_lookup_owner', organization_id: (newOrg as any).id });
      throw new Error(errorMessage);
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
      const errorMessage = `[Bootstrap Step: Membership Creation] Failed to create membership: ${memberError.message}`;
      console.error(errorMessage, {
        step: 'membership_creation',
        userId,
        organization_id: (newOrg as any).id,
        role_id: (ownerRole as any).id,
        username,
        error_code: memberError.code,
        error_details: memberError.details,
        error_hint: memberError.hint,
      });
      throw new Error(`${errorMessage} (PostgREST code: ${memberError.code || 'unknown'})`);
    }
    if (!newMembership) {
      const errorMessage = `[Bootstrap Step: Membership Creation] Membership insert returned no data for user_id=${userId}, org_id=${(newOrg as any).id}`;
      console.error(errorMessage, {
        step: 'membership_creation',
        userId,
        organization_id: (newOrg as any).id,
      });
      throw new Error(errorMessage);
    }

    console.log(`[Bootstrap] Membership created successfully: membership_id=${(newMembership as any).id}`);

    // Write audit logs
    console.log(`[Bootstrap Step: Audit Logs] Writing audit logs`);
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
      console.warn(`[Bootstrap Step: Audit Logs] Error writing audit logs (non-fatal): ${auditError.message}`, auditError);
      // Audit logs are non-fatal, so we don't throw here
    } else {
      console.log(`[Bootstrap Step: Audit Logs] Audit logs written successfully`);
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
