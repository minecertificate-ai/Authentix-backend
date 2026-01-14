/**
 * ORGANIZATION TYPES
 *
 * Types for organization management.
 */

import { z } from 'zod';

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  industry_id: z.string().uuid().optional().nullable(),
  address_line1: z.string().optional().nullable(),
  address_line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state_province: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  logo_file_id: z.string().uuid().optional().nullable(),
});

export type UpdateOrganizationDTO = z.infer<typeof updateOrganizationSchema>;

export interface OrganizationEntity {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  industry_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
  gstin: string | null;
  logo_file_id: string | null;
  application_id: string;
  api_key_hash: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationAPISettings {
  application_id: string;
  api_key_exists: boolean;
  api_key_created_at: string | null;
  api_key_last_rotated_at: string | null;
}
