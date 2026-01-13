/**
 * USER TYPES
 *
 * Types for user profile management.
 */

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  } | null;
  membership: {
    id: string;
    organization_id: string;
    username: string;
    role: string;
    status: string;
  } | null;
}
