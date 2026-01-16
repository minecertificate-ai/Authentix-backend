/**
 * CERTIFICATE SERVICE
 *
 * Business logic for certificate generation and management.
 */

import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import type { TemplateRepository } from '../templates/repository.js';
import type {
  GenerateCertificatesDTO,
  CertificateGenerationResult,
} from './types.js';
import {
  generateCertificatePDF,
  generateVerificationToken,
  sanitizeFileName,
} from './pdf-generator.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

const MAX_SYNC_BATCH_SIZE = 50;

export class CertificateService {
  constructor(private readonly templateRepository: TemplateRepository) {}

  /**
   * Generate certificates
   *
   * For batches <= 50: Synchronous generation
   * For batches > 50: Returns job ID for async processing
   */
  async generateCertificates(
    organizationId: string,
    _userId: string,
    dto: GenerateCertificatesDTO,
    appUrl: string
  ): Promise<CertificateGenerationResult> {
    // Validate batch size
    if (dto.data.length > MAX_SYNC_BATCH_SIZE) {
      // Return job ID for async processing
      const jobId = randomUUID();
      // TODO: Queue async job
      return {
        job_id: jobId,
        status: 'pending',
        total_certificates: dto.data.length,
      };
    }

    // Get template with version and files (new schema)
    const supabase = getSupabaseClient();
    const { data: templateData, error: templateError } = await supabase
      .from('certificate_templates')
      .select(`
        id,
        title,
        latest_version_id,
        latest_version:certificate_template_versions!fk_templates_latest_version (
          id,
          source_file_id,
          source_file:source_file_id (
            id,
            bucket,
            path,
            mime_type
          )
        )
      `)
      .eq('id', dto.template_id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (templateError || !templateData) {
      throw new NotFoundError('Template not found');
    }

    const version = (templateData as any).latest_version;
    if (!version || !version.source_file) {
      throw new ValidationError('Template version or source file not found');
    }

    // Get template fields
    const { data: fieldsData, error: fieldsError } = await supabase
      .from('certificate_template_fields')
      .select('id, field_key, label, type, page_number, x, y, width, height, style, required')
      .eq('template_version_id', version.id)
      .order('created_at', { ascending: true });

    if (fieldsError) {
      throw new Error(`Failed to fetch template fields: ${fieldsError.message}`);
    }

    const fields = (fieldsData ?? []).map((f: any) => ({
      id: f.id,
      field_key: f.field_key,
      label: f.label,
      type: f.type,
      page_number: f.page_number,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      style: f.style,
      required: f.required,
    }));

    // Get signed URL for source file
    const sourceFile = version.source_file;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(sourceFile.bucket)
      .createSignedUrl(sourceFile.path, 3600);

    if (urlError || !urlData) {
      throw new Error(`Failed to get template file URL: ${urlError?.message || 'Unknown error'}`);
    }

    const templateUrl = urlData.signedUrl;
    const templateMimeType = sourceFile.mime_type;
    const templateType = templateMimeType === 'application/pdf' ? 'pdf' : 
                        templateMimeType?.startsWith('image/') ? 'image' : 'pdf';

    // Generate certificates synchronously
    const zip = new JSZip();
    const certificates: Array<{ file_name: string; recipient_name: string }> = [];

    for (let i = 0; i < dto.data.length; i++) {
      const rowData = dto.data[i]!;

      try {
        // Generate verification token
        const verificationToken = generateVerificationToken();

        // Generate PDF
        const pdfBytes = await generateCertificatePDF({
          templateUrl,
          templateType,
          templateWidth: undefined,
          templateHeight: undefined,
          fields,
          fieldMappings: dto.field_mappings,
          rowData,
          includeQR: dto.options?.includeQR ?? true,
          verificationToken,
          appUrl,
        });

        // Get recipient name for filename
        const nameMapping = dto.field_mappings.find(
          (m) =>
            fields.find((f) => f.id === m.fieldId)?.type === 'name'
        );
        const recipientName = nameMapping
          ? String(rowData[nameMapping.columnName] ?? 'certificate')
          : 'certificate';
        const fileName = sanitizeFileName(recipientName || `certificate_${i + 1}`);

        // Add to ZIP
        zip.file(`${fileName}.pdf`, pdfBytes);

        certificates.push({
          file_name: `${fileName}.pdf`,
          recipient_name: recipientName,
        });
      } catch (error) {
        console.error(`Error generating certificate ${i + 1}:`, error);
        // Continue with other certificates
      }
    }

    // Generate ZIP file
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Upload to Supabase Storage
    const zipFileName = `${Date.now()}-certificates.zip`;
    const storagePath = `certificates/${organizationId}/${zipFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('authentix')
      .upload(storagePath, zipBuffer, {
        contentType: 'application/zip',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
    }

    // Get signed URL (expires in 1 hour)
    const { data: signedUrlData } = await supabase.storage
      .from('authentix')
      .createSignedUrl(storagePath, 3600);

    return {
      status: 'completed',
      download_url: signedUrlData?.signedUrl ?? '',
      total_certificates: certificates.length,
      certificates,
    };
  }
}
