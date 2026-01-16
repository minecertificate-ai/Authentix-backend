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
 * Template file type
 */
export const templateFileTypeSchema = z.enum(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'pptx']);

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
  // status: removed - all templates are active and ready to use
});

export type CreateTemplateDTO = z.infer<typeof createTemplateSchema>;

/**
 * Update template DTO
 * Note: Status removed - all templates are active and ready to use
 */
export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  // status: removed - templates are always active when uploaded
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
  organization_id: string;
  name: string;
  description: string | null;
  file_type: TemplateFileType;
  storage_path: string;
  preview_url: string | null;
  // status: removed - all templates are active and ready to use
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

/**
 * Template field DTO for new schema (certificate_template_fields)
 */
export const templateFieldDTOSchema = z.object({
  field_key: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/, 'field_key must be lowercase alphanumeric with underscores only'),
  label: z.string().min(2).max(80),
  type: z.enum(['text', 'date', 'qrcode', 'custom']),
  page_number: z.number().int().positive(),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  style: z.record(z.unknown()).optional(),
  required: z.boolean().default(false),
});

export type TemplateFieldDTO = z.infer<typeof templateFieldDTOSchema>;

/**
 * Update fields request schema
 */
export const updateFieldsSchema = z.object({
  fields: z.array(templateFieldDTOSchema).max(200, 'Maximum 200 fields allowed'),
});

export type UpdateFieldsDTO = z.infer<typeof updateFieldsSchema>;

/**
 * Template editor data (template + version + files + fields)
 */
export interface TemplateEditorData {
  template: {
    id: string;
    title: string;
    // status: removed - all templates are active and ready to use
    category_id: string;
    subcategory_id: string;
    created_at: string;
  };
  latest_version: {
    id: string;
    version_number: number;
    page_count: number;
    normalized_pages: Record<string, unknown> | null;
  };
  source_file: {
    id: string;
    bucket: string;
    path: string;
    mime_type: string;
  };
  preview_file: {
    id: string;
    bucket: string;
    path: string;
  } | null;
  fields: Array<{
    id: string;
    field_key: string;
    label: string;
    type: string;
    page_number: number;
    x: number;
    y: number;
    width: number | null;
    height: number | null;
    style: Record<string, unknown> | null;
    required: boolean;
  }>;
}
