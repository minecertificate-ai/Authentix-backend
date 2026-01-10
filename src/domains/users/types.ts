/**
 * USER TYPES
 *
 * Types for user profile management.
 */

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string;
  company: {
    name: string;
    logo: string | null;
  } | null;
}
