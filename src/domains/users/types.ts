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
    application_id: string;
    billing_status: string;
    industry_id: string | null;
    logo: {
      file_id: string;
      bucket: string;
      path: string;
    } | null;
  } | null;
  membership: {
    id: string;
    organization_id: string;
    username: string;
    role_id: string;
    role_key: string;
    status: string;
  } | null;
}
