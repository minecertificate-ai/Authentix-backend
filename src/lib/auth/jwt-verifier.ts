/**
 * JWT VERIFIER
 *
 * Verifies Supabase JWT tokens and extracts user context.
 */

import { getSupabaseClient } from '../supabase/client.js';

export interface AuthContext {
  userId: string;
  companyId: string;
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
 * @returns User context (userId, companyId, role)
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

  // Get user record with company_id
  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('id, company_id, role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (userError || !userRecord) {
    throw new UnauthorizedError('User not found');
  }

  const record = userRecord as { id: string; company_id: string | null; role: string | null } | null;
  if (!record || !record.company_id) {
    throw new UnauthorizedError('User has no company');
  }

  return {
    userId: record.id,
    companyId: record.company_id,
    role: record.role ?? 'member',
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
