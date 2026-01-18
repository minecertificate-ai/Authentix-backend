/**
 * CERTIFICATE SERVICE
 *
 * Business logic for certificate generation and management.
 *
 * Saves generated certificates to:
 * - certificate_generation_jobs
 * - generation_job_recipients
 * - generation_job_templates
 * - certificates
 * - files (for certificate PDF/image and preview)
 */

import JSZip from 'jszip';
import crypto from 'node:crypto';
import type { TemplateRepository } from '../templates/repository.js';
import type {
  GenerateCertificatesDTO,
  CertificateGenerationResult,
} from './types.js';
import {
  generateCertificatePDF,
  generateCertificateImage,
  generateVerificationToken,
  sanitizeFileName,
  type GeneratorField,
} from './pdf-generator.js';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors/handler.js';

const MAX_SYNC_BATCH_SIZE = 50;

/**
 * Compute SHA-256 hash of a buffer
 */
function computeSHA256(buffer: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export class CertificateService {
  // Note: templateRepository is kept for backward compatibility and potential future use
  constructor(private readonly templateRepository: TemplateRepository) {
    // Suppress unused warning - repository may be used in future methods
    void this.templateRepository;
  }

  /**
   * Generate certificates
   *
   * For batches <= 50: Synchronous generation
   * For batches > 50: Returns job ID for async processing
   *
   * Saves to database tables:
   * - certificate_generation_jobs
   * - generation_job_recipients
   * - generation_job_templates
   * - certificates
   * - files
   */
  async generateCertificates(
    organizationId: string,
    userId: string,
    dto: GenerateCertificatesDTO,
    appUrl: string
  ): Promise<CertificateGenerationResult> {
    const supabase = getSupabaseClient();

    // Validate batch size
    if (dto.data.length > MAX_SYNC_BATCH_SIZE) {
      // Create a queued job for async processing
      // Note: job_status enum is 'queued', 'running', 'completed', 'failed', 'cancelled'
      const { data: pendingJob, error: jobError } = await supabase
        .from('certificate_generation_jobs')
        .insert({
          organization_id: organizationId,
          requested_by_user_id: userId,
          status: 'queued',
          options: dto.options || {},
        } as any)
        .select('id')
        .single();

      if (jobError || !pendingJob) {
        throw new Error(`Failed to create generation job: ${jobError?.message || 'Unknown error'}`);
      }

      // TODO: Queue async job processing
      return {
        job_id: (pendingJob as { id: string }).id,
        status: 'queued',
        total_certificates: dto.data.length,
      };
    }

    // Get template with version and files (new schema)
    const { data: templateData, error: templateError } = await supabase
      .from('certificate_templates')
      .select(`
        id,
        title,
        category_id,
        subcategory_id,
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

    console.log('[CertificateService] Template data retrieved:', {
      template_id: (templateData as any).id,
      title: (templateData as any).title,
      latest_version_id: (templateData as any).latest_version_id,
      has_latest_version: !!(templateData as any).latest_version,
      raw_template_data: JSON.stringify(templateData),
    });

    const version = (templateData as any).latest_version;
    if (!version || !version.source_file) {
      console.error('[CertificateService] Missing version or source file:', {
        version: version ? JSON.stringify(version) : 'null',
        has_source_file: version?.source_file ? 'yes' : 'no',
      });
      throw new ValidationError('Template version or source file not found');
    }

    const categoryId = (templateData as any).category_id;
    const subcategoryId = (templateData as any).subcategory_id;

    // Get template fields
    const { data: fieldsData, error: fieldsError } = await supabase
      .from('certificate_template_fields')
      .select('id, field_key, label, type, page_number, x, y, width, height, style, required')
      .eq('template_version_id', version.id)
      .order('created_at', { ascending: true });

    if (fieldsError) {
      throw new Error(`Failed to fetch template fields: ${fieldsError.message}`);
    }

    // Map database fields to GeneratorField format
    // Extract style properties from the style JSON
    const fields: GeneratorField[] = (fieldsData ?? []).map((f: any) => {
      const style = f.style || {};
      return {
        id: f.id,
        field_key: f.field_key,
        label: f.label,
        type: f.type,
        page_number: f.page_number,
        x: f.x || 0,
        y: f.y || 0,
        width: f.width || 200,
        height: f.height || 30,
        fontSize: style.fontSize || 16,
        fontFamily: style.fontFamily || 'Helvetica',
        color: style.color || '#000000',
        textAlign: style.textAlign || 'left',
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        prefix: style.prefix,
        suffix: style.suffix,
        dateFormat: style.dateFormat,
        required: f.required,
      };
    });

    // Get signed URL for source file
    const sourceFile = version.source_file;
    const { data: urlData, error: urlError } = await supabase.storage
      .from(sourceFile.bucket)
      .createSignedUrl(sourceFile.path, 3600);

    if (urlError || !urlData) {
      throw new Error(`Failed to get template file URL: ${urlError?.message || 'Unknown error'}`);
    }

    const templateUrl = urlData.signedUrl;
    const templateMimeType = sourceFile.mime_type as string;

    console.log('[CertificateService] Source file details:', {
      file_id: sourceFile.id,
      bucket: sourceFile.bucket,
      path: sourceFile.path,
      mime_type: sourceFile.mime_type,
      raw_source_file: JSON.stringify(sourceFile),
    });

    // Determine output format based on template type
    // PDF templates → export as PDF
    // Image templates → export as same image format
    const isPdfTemplate = templateMimeType === 'application/pdf';
    const outputFormat = isPdfTemplate ? 'pdf' : this.getImageFormat(templateMimeType);
    const outputMimeType = isPdfTemplate ? 'application/pdf' : templateMimeType;
    const outputExtension = this.getFileExtension(outputFormat);

    console.log('[CertificateService] Generation config:', {
      templateMimeType,
      isPdfTemplate,
      outputFormat,
      outputMimeType,
      outputExtension,
    });

    // Step 1: Create generation job record
    // Note: job_status enum is 'queued', 'running', 'completed', 'failed', 'cancelled'
    // Table has: id, organization_id, status, options, requested_by_user_id, created_at, updated_at, completed_at, error
    const { data: generationJob, error: jobError } = await supabase
      .from('certificate_generation_jobs')
      .insert({
        organization_id: organizationId,
        requested_by_user_id: userId,
        status: 'running',
        options: dto.options || {},
      } as any)
      .select('id')
      .single();

    if (jobError || !generationJob) {
      throw new Error(`Failed to create generation job: ${jobError?.message || 'Unknown error'}`);
    }

    const jobId = (generationJob as { id: string }).id;
    console.log('[CertificateService] Created generation job:', jobId);

    try {
      // Step 2: Create generation_job_templates record
      const { error: jobTemplateError } = await supabase
        .from('generation_job_templates')
        .insert({
          job_id: jobId,
          template_id: dto.template_id,
          template_version_id: version.id,
          category_id: categoryId,
          subcategory_id: subcategoryId,
        } as any);

      if (jobTemplateError) {
        throw new Error(`Failed to create job template record: ${jobTemplateError.message}`);
      }

      // Step 3: Create generation_job_recipients records
      // Extract recipient info directly from row data using common key patterns
      const recipientRecords = dto.data.map((rowData, index) => {
        // Find recipient name from common column names
        const nameKeys = ['Recipient Name', 'recipient_name', 'Name', 'name', 'Full Name', 'full_name', 'Student Name', 'Candidate Name'];
        let recipientName = 'Unknown';
        for (const key of nameKeys) {
          if (rowData[key] && String(rowData[key]).trim()) {
            recipientName = String(rowData[key]).trim();
            break;
          }
        }

        // Find email from common column names
        const emailKeys = ['Email', 'email', 'E-mail', 'e-mail', 'Recipient Email', 'recipient_email'];
        let recipientEmail: string | null = null;
        for (const key of emailKeys) {
          if (rowData[key] && String(rowData[key]).trim()) {
            recipientEmail = String(rowData[key]).trim();
            break;
          }
        }

        // Find phone from common column names
        const phoneKeys = ['Phone', 'phone', 'Mobile', 'mobile', 'Contact', 'contact', 'Phone Number', 'phone_number'];
        let recipientPhone: string | null = null;
        for (const key of phoneKeys) {
          if (rowData[key] && String(rowData[key]).trim()) {
            recipientPhone = String(rowData[key]).trim();
            break;
          }
        }

        console.log(`[CertificateService] Recipient ${index + 1}:`, { recipientName, recipientEmail, recipientPhone });

        return {
          job_id: jobId,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          recipient_phone: recipientPhone,
          recipient_data: rowData,
        };
      });

      const { data: recipientDataRaw, error: recipientError } = await supabase
        .from('generation_job_recipients')
        .insert(recipientRecords as any)
        .select('id, recipient_name, recipient_email, recipient_phone');

      if (recipientError) {
        throw new Error(`Failed to create recipient records: ${recipientError.message}`);
      }

      // Type assertion for recipient data
      const recipientData = recipientDataRaw as Array<{
        id: string;
        recipient_name: string;
        recipient_email: string | null;
        recipient_phone: string | null;
      }> | null;

      console.log('[CertificateService] Created', recipientData?.length, 'recipient records');

      // Step 4: Generate certificates
      const zip = new JSZip();
      const certificateResults: Array<{
        id: string;
        file_name: string;
        recipient_name: string;
        recipient_email: string | null;
        recipient_phone: string | null;
        certificate_number: string;
        verification_token: string;
        issued_at: string;
        expires_at: string | null;
        file_path: string;
        preview_path: string | null;
      }> = [];
      const errors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < dto.data.length; i++) {
        const rowData = dto.data[i]!;
        const recipient = recipientData?.[i];

        if (!recipient) {
          errors.push({ index: i, error: 'Missing recipient data' });
          continue;
        }

        try {
          // Generate verification token
          const verificationToken = generateVerificationToken();
          const verificationTokenHash = computeSHA256(Buffer.from(verificationToken));

          // Get next certificate number using RPC (handles race conditions)
          const { data: certNumData, error: certNumError } = await supabase.rpc('next_certificate_number', {
            p_organization_id: organizationId,
          } as any);

          console.log(`[CertificateService] Certificate number RPC result for ${i + 1}:`, { certNumData, certNumError });

          if (certNumError) {
            console.error('[CertificateService] Failed to get certificate number:', certNumError);
            errors.push({ index: i, error: `Failed to get certificate number: ${certNumError.message}` });
            continue;
          }

          if (!certNumData) {
            console.error('[CertificateService] Certificate number is null/undefined');
            errors.push({ index: i, error: 'Certificate number is null' });
            continue;
          }

          const certificateNumber = String(certNumData);

          // Generate certificate in the correct format
          let certificateBytes: Uint8Array;

          if (isPdfTemplate) {
            // Generate PDF for PDF template
            certificateBytes = await generateCertificatePDF({
              templateUrl,
              templateType: 'pdf',
              templateWidth: undefined,
              templateHeight: undefined,
              fields,
              fieldMappings: dto.field_mappings,
              rowData,
              includeQR: dto.options?.includeQR ?? true,
              verificationToken,
              appUrl,
            });
          } else {
            // Generate image for image template
            certificateBytes = await generateCertificateImage({
              templateUrl,
              templateMimeType,
              fields,
              fieldMappings: dto.field_mappings,
              rowData,
              includeQR: dto.options?.includeQR ?? true,
              verificationToken,
              appUrl,
            });
          }

          const certificateBuffer = Buffer.from(certificateBytes);

          // Determine issue date (use custom if provided, otherwise NOW)
          const issuedAt = dto.options?.issue_date
            ? new Date(dto.options.issue_date)
            : new Date();

          // Calculate expires_at based on expiry_type option
          let expiresAt: string | null = null;
          const expiryType = dto.options?.expiry_type ?? 'year';

          if (expiryType === 'custom' && dto.options?.custom_expiry_date) {
            // Use custom expiry date
            expiresAt = new Date(dto.options.custom_expiry_date).toISOString();
          } else if (expiryType === 'never') {
            // No expiry
            expiresAt = null;
          } else {
            // Calculate expiry based on type
            const expiryDate = new Date(issuedAt);
            switch (expiryType) {
              case 'day':
                expiryDate.setDate(expiryDate.getDate() + 1);
                break;
              case 'week':
                expiryDate.setDate(expiryDate.getDate() + 7);
                break;
              case 'month':
                expiryDate.setMonth(expiryDate.getMonth() + 1);
                break;
              case 'year':
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                break;
              case '5_years':
                expiryDate.setFullYear(expiryDate.getFullYear() + 5);
                break;
              default:
                // Default to 1 year
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            }
            expiresAt = expiryDate.toISOString();
          }

          // Fallback: Check CSV data for expiry date (for backwards compatibility)
          if (!expiresAt && expiryType !== 'never') {
            const expiryKeys = ['Expiry Date', 'expiry_date', 'Expires At', 'expires_at', 'Valid Until', 'valid_until', 'Expiration', 'expiration', 'Validity', 'validity_date'];
            for (const key of expiryKeys) {
              if (rowData[key] && String(rowData[key]).trim()) {
                const expiryValue = String(rowData[key]).trim();
                try {
                  const expiryDate = new Date(expiryValue);
                  if (!isNaN(expiryDate.getTime())) {
                    expiresAt = expiryDate.toISOString();
                    break;
                  }
                } catch {
                  // Continue to next key if date parsing fails
                }
              }
            }
          }

          console.log(`[CertificateService] Creating certificate record ${i + 1}:`, {
            recipient_name: recipient.recipient_name,
            certificate_number: certificateNumber,
            verification_token: verificationToken.substring(0, 10) + '...',
            issued_at: issuedAt.toISOString(),
            expires_at: expiresAt,
            expiry_type: expiryType,
          });

          // Create certificate record first to get the ID
          const { data: certRecord, error: certError } = await supabase
            .from('certificates')
            .insert({
              organization_id: organizationId,
              generation_job_id: jobId,
              template_id: dto.template_id,
              template_version_id: version.id,
              category_id: categoryId,
              subcategory_id: subcategoryId,
              recipient_name: recipient.recipient_name,
              recipient_email: recipient.recipient_email,
              recipient_phone: recipient.recipient_phone,
              recipient_data: rowData,
              certificate_number: certificateNumber,
              verification_token_hash: verificationTokenHash,
              verification_path: `/verify/${verificationToken}`,
              qr_payload_url: `${appUrl}/verify/${verificationToken}`,
              status: 'issued',
              issued_at: issuedAt.toISOString(),
              expires_at: expiresAt,
            } as any)
            .select('id')
            .single();

          if (certError || !certRecord) {
            console.error('[CertificateService] Failed to create certificate record:', certError);
            errors.push({ index: i, error: `Failed to create certificate record: ${certError?.message || 'Unknown'}` });
            continue;
          }

          const certificateId = (certRecord as { id: string }).id;

          // Step 5: Upload certificate file to storage
          const storagePath = `certificates/${organizationId}/${certificateId}/certificate.${outputExtension}`;

          const { error: uploadError } = await supabase.storage
            .from('authentix')
            .upload(storagePath, certificateBuffer, {
              contentType: outputMimeType,
              upsert: false,
            });

          if (uploadError) {
            console.error('[CertificateService] Failed to upload certificate:', uploadError);
            errors.push({ index: i, error: `Failed to upload certificate: ${uploadError.message}` });
            // Clean up certificate record
            await (supabase.from('certificates') as any).delete().eq('id', certificateId);
            continue;
          }

          // Step 6: Create file record
          // Note: file_kind enum only has 'certificate_pdf', use 'other' for images
          const checksum = computeSHA256(certificateBuffer);
          const { data: fileRecord, error: fileError } = await supabase
            .from('files')
            .insert({
              organization_id: organizationId,
              bucket: 'authentix',
              path: storagePath,
              kind: 'certificate_pdf', // Use certificate_pdf for all certificate files
              original_name: `certificate_${certificateNumber}.${outputExtension}`,
              mime_type: outputMimeType,
              size_bytes: certificateBuffer.length,
              checksum_sha256: checksum,
              created_by_user_id: userId,
            } as any)
            .select('id')
            .single();

          if (fileError || !fileRecord) {
            console.error('[CertificateService] Failed to create file record:', fileError);
            // Clean up storage and certificate record
            await supabase.storage.from('authentix').remove([storagePath]);
            await (supabase.from('certificates') as any).delete().eq('id', certificateId);
            errors.push({ index: i, error: `Failed to create file record: ${fileError?.message || 'Unknown'}` });
            continue;
          }

          const fileId = (fileRecord as { id: string }).id;

          // Step 7: Generate certificate preview (PNG image)
          let previewFileId: string | null = null;
          try {
            let previewBuffer: Buffer;

            if (isPdfTemplate) {
              // For PDF certificates, we use the PDF itself as the preview
              // Note: For proper PNG preview generation, consider using pdf2pic or similar library
              // which requires system dependencies (poppler-utils)
              previewBuffer = certificateBuffer;
            } else {
              // For image certificates, create a smaller preview version using sharp
              // Import sharp dynamically to handle ESM/CJS interop
              const sharpModule = await import('sharp');
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sharpFn = (sharpModule as any).default ?? sharpModule;
              const metadata = await sharpFn(certificateBuffer).metadata();
              const previewWidth = Math.min(metadata.width || 800, 800);

              previewBuffer = await sharpFn(certificateBuffer)
                .resize(previewWidth, undefined, { fit: 'inside' })
                .png()
                .toBuffer();
            }

            // Upload preview to storage
            // For PDFs, keep as PDF; for images, use PNG
            const previewExtension = isPdfTemplate ? 'pdf' : 'png';
            const previewMimeType = isPdfTemplate ? 'application/pdf' : 'image/png';
            const previewPath = `certificates/${organizationId}/${certificateId}/preview.${previewExtension}`;
            const { error: previewUploadError } = await supabase.storage
              .from('authentix')
              .upload(previewPath, previewBuffer, {
                contentType: previewMimeType,
                upsert: false,
              });

            if (!previewUploadError) {
              // Create file record for preview
              const previewChecksum = computeSHA256(previewBuffer);
              const { data: previewFileRecord, error: previewFileError } = await supabase
                .from('files')
                .insert({
                  organization_id: organizationId,
                  bucket: 'authentix',
                  path: previewPath,
                  kind: 'certificate_preview',
                  original_name: `certificate_${certificateNumber}_preview.${previewExtension}`,
                  mime_type: previewMimeType,
                  size_bytes: previewBuffer.length,
                  checksum_sha256: previewChecksum,
                  created_by_user_id: userId,
                } as any)
                .select('id')
                .single();

              if (previewFileRecord && !previewFileError) {
                previewFileId = (previewFileRecord as { id: string }).id;
              }
            }
          } catch (previewError) {
            // Preview generation is non-fatal - continue without preview
            console.warn('[CertificateService] Failed to generate certificate preview (non-fatal):', previewError);
          }

          // Step 8: Update certificate with file IDs
          const updateData: Record<string, unknown> = {
            certificate_file_id: fileId,
          };
          if (previewFileId) {
            updateData.certificate_preview_file_id = previewFileId;
          }

          const { error: updateError } = await (supabase
            .from('certificates') as any)
            .update(updateData)
            .eq('id', certificateId);

          if (updateError) {
            console.error('[CertificateService] Failed to update certificate with file ID:', updateError);
          }

          // Sanitize filename for ZIP
          const fileName = sanitizeFileName(recipient.recipient_name || `certificate_${i + 1}`);

          // Add to ZIP
          zip.file(`${fileName}.${outputExtension}`, certificateBuffer);

          // Calculate preview path (matches the pattern used in Step 7)
          const previewExtension = isPdfTemplate ? 'pdf' : 'png';
          const certPreviewPath = previewFileId
            ? `certificates/${organizationId}/${certificateId}/preview.${previewExtension}`
            : null;

          certificateResults.push({
            id: certificateId,
            file_name: `${fileName}.${outputExtension}`,
            recipient_name: recipient.recipient_name,
            recipient_email: recipient.recipient_email,
            recipient_phone: recipient.recipient_phone,
            certificate_number: certificateNumber,
            verification_token: verificationToken,
            issued_at: issuedAt.toISOString(),
            expires_at: expiresAt,
            file_path: storagePath,
            preview_path: certPreviewPath,
          });

          console.log('[CertificateService] Generated certificate:', certificateId, 'for', recipient.recipient_name);
        } catch (error) {
          console.error(`Error generating certificate ${i + 1}:`, error);
          errors.push({ index: i, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      // Log summary of generation results
      console.log('[CertificateService] Generation loop completed:', {
        totalRecipients: dto.data.length,
        successCount: certificateResults.length,
        errorCount: errors.length,
        errors: errors,
      });

      // Step 8: Generate ZIP file and upload to exports folder
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipFileName = `${jobId}.zip`;
      const exportZipPath = `exports/${organizationId}/${zipFileName}`;
      const { error: zipUploadError } = await supabase.storage
        .from('authentix')
        .upload(exportZipPath, zipBuffer, {
          contentType: 'application/zip',
          upsert: false,
        });

      if (zipUploadError) {
        console.error('[CertificateService] Failed to upload ZIP:', zipUploadError);
        // Continue - certificates were still generated
      }

      // Get signed URL for download (expires in 1 hour)
      const { data: signedUrlData } = await supabase.storage
        .from('authentix')
        .createSignedUrl(exportZipPath, 3600);

      // Step 9: Update job status to completed
      const { error: jobUpdateError } = await (supabase
        .from('certificate_generation_jobs') as any)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error: errors.length > 0 ? { errors } : null,
        })
        .eq('id', jobId);

      if (jobUpdateError) {
        console.error('[CertificateService] Failed to update job status:', jobUpdateError);
      }

      console.log('[CertificateService] Generation completed:', {
        jobId,
        totalCertificates: certificateResults.length,
        errors: errors.length,
      });

      // Generate signed URLs for each certificate
      const certificatesWithUrls = await Promise.all(
        certificateResults.map(async (c) => {
          let downloadUrl: string | null = null;
          let previewUrl: string | null = null;

          try {
            const { data: downloadData } = await supabase.storage
              .from('authentix')
              .createSignedUrl(c.file_path, 3600);
            downloadUrl = downloadData?.signedUrl ?? null;
          } catch {
            // Ignore URL generation errors
          }

          if (c.preview_path) {
            try {
              const { data: previewData } = await supabase.storage
                .from('authentix')
                .createSignedUrl(c.preview_path, 3600);
              previewUrl = previewData?.signedUrl ?? null;
            } catch {
              // Ignore preview URL errors
            }
          }

          return {
            id: c.id,
            certificate_number: c.certificate_number,
            recipient_name: c.recipient_name,
            recipient_email: c.recipient_email,
            recipient_phone: c.recipient_phone,
            issued_at: c.issued_at,
            expires_at: c.expires_at,
            download_url: downloadUrl,
            preview_url: previewUrl,
          };
        })
      );

      // Only provide ZIP URL if more than 10 certificates
      const zipDownloadUrl = certificateResults.length > 10 ? (signedUrlData?.signedUrl ?? null) : null;

      return {
        job_id: jobId,
        status: 'completed',
        download_url: signedUrlData?.signedUrl ?? '',
        zip_download_url: zipDownloadUrl ?? undefined,
        total_certificates: certificateResults.length,
        certificates: certificatesWithUrls,
      };
    } catch (error) {
      // Update job status to failed
      await (supabase
        .from('certificate_generation_jobs') as any)
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: { message: error instanceof Error ? error.message : 'Unknown error' },
        })
        .eq('id', jobId);

      throw error;
    }
  }

  /**
   * Get image format from MIME type
   */
  private getImageFormat(mimeType: string): 'png' | 'jpg' | 'webp' {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg'; // Default to JPEG for image/jpeg and others
  }

  /**
   * Get file extension from format
   */
  private getFileExtension(format: string): string {
    if (format === 'pdf') return 'pdf';
    if (format === 'png') return 'png';
    if (format === 'webp') return 'webp';
    return 'jpg';
  }
}
