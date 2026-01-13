/**
 * JWT VERIFIER
 *
 * Verifies Supabase JWT tokens and extracts user context.
 */

import { getSupabaseClient } from '../supabase/client.js';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: string;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Verify JWT token and extract user context
 *
 * @param token - Supabase JWT token
 * @returns User context (userId, organizationId, role)
 * @throws UnauthorizedError if token is invalid
 */
export async function verifyJWT(token: string): Promise<AuthContext> {
  const supabase = getSupabaseClient();

  // Verify JWT and get user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Get organization membership with role
  const { data: membership, error: memberError } = await supabase
    .from('organization_members')
    .select(`
      id,
      organization_id,
      user_id,
      status,
      organization_roles:role_id (
        key
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle();

  if (memberError || !membership) {
    throw new UnauthorizedError('User has no active organization membership');
  }

  const memberRecord = membership as {
    id: string;
    organization_id: string;
    user_id: string;
    status: string;
    organization_roles: { key: string } | null;
  };

  if (!memberRecord.organization_id) {
    throw new UnauthorizedError('User has no organization');
  }

  return {
    userId: user.id,
    organizationId: memberRecord.organization_id,
    role: memberRecord.organization_roles?.key ?? 'member',
  };
}

/**
 * Extract JWT token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns JWT token or null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] ?? null;
}
