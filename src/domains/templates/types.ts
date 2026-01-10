/**
 * TEMPLATE TYPES
 *
 * Domain types for certificate templates.
 */

import { z } from 'zod';

/**
 * Certificate field type
 */
export const certificateFieldSchema = z.object({
  id: z.string(),
  type: z.enum(['name', 'course', 'date', 'start_date', 'end_date', 'custom', 'qr_code']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fontSize: z.number().min(8).max(200).default(16),
  fontFamily: z.string().default('Helvetica'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#000000'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  dateFormat: z.string().optional(),
});

export type CertificateField = z.infer<typeof certificateFieldSchema>;

/**
 * Template status
 */
export const templateStatusSchema = z.enum(['draft', 'active', 'archived']);

export type TemplateStatus = z.infer<typeof templateStatusSchema>;

/**
 * Template file type
 */
export const templateFileTypeSchema = z.enum(['pdf', 'png', 'jpg', 'jpeg']);

export type TemplateFileType = z.infer<typeof templateFileTypeSchema>;

/**
 * Create template DTO
 */
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  file_type: templateFileTypeSchema,
  certificate_category: z.string().optional(),
  certificate_subcategory: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fields: z.array(certificateFieldSchema).default([]),
  status: templateStatusSchema.optional().default('active'),
});

export type CreateTemplateDTO = z.infer<typeof createTemplateSchema>;

/**
 * Update template DTO
 */
export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  status: templateStatusSchema.optional(),
  fields: z.array(certificateFieldSchema).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type UpdateTemplateDTO = z.infer<typeof updateTemplateSchema>;

/**
 * Template entity (database representation)
 */
export interface TemplateEntity {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  file_type: TemplateFileType;
  storage_path: string;
  preview_url: string | null;
  status: TemplateStatus;
  fields: CertificateField[];
  width: number | null;
  height: number | null;
  certificate_category: string | null;
  certificate_subcategory: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
