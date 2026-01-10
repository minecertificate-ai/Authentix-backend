/**
 * COMPANY TYPES
 *
 * Types for company management.
 */

import { z } from 'zod';

export const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  industry: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  gst_number: z.string().optional().nullable(),
  cin_number: z.string().optional().nullable(),
  logo: z.string().url().optional().nullable(),
});

export type UpdateCompanyDTO = z.infer<typeof updateCompanySchema>;

export interface CompanyEntity {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  gst_number: string | null;
  cin_number: string | null;
  logo: string | null;
  application_id: string;
  api_enabled: boolean;
  api_key_created_at: string | null;
  api_key_last_rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyAPISettings {
  application_id: string;
  api_enabled: boolean;
  api_key_exists: boolean;
  api_key_created_at: string | null;
  api_key_last_rotated_at: string | null;
}
