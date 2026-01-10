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
    companyId: string,
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

    // Get template
    const template = await this.templateRepository.findById(
      dto.template_id,
      companyId
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    if (template.status !== 'active') {
      throw new ValidationError('Template is not active');
    }

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
          templateUrl: template.preview_url ?? '',
          templateType: template.file_type,
          templateWidth: template.width ?? undefined,
          templateHeight: template.height ?? undefined,
          fields: template.fields,
          fieldMappings: dto.field_mappings,
          rowData,
          includeQR: dto.options?.includeQR ?? true,
          verificationToken,
          appUrl,
        });

        // Get recipient name for filename
        const nameMapping = dto.field_mappings.find(
          (m) =>
            template.fields.find((f) => f.id === m.fieldId)?.type === 'name'
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
    const supabase = getSupabaseClient();
    const zipFileName = `${Date.now()}-certificates.zip`;
    const storagePath = `bulk-downloads/${companyId}/${zipFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('minecertificate')
      .upload(storagePath, zipBuffer, {
        contentType: 'application/zip',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
    }

    // Get signed URL (expires in 1 hour)
    const { data: urlData } = await supabase.storage
      .from('minecertificate')
      .createSignedUrl(storagePath, 3600);

    return {
      status: 'completed',
      download_url: urlData?.signedUrl ?? '',
      total_certificates: certificates.length,
      certificates,
    };
  }
}
