/**
 * TEMPLATE PREVIEW GENERATOR
 *
 * Generates preview images for template versions.
 * Supports PDF (page 1) and image files (PNG, JPEG, WebP).
 */

import { PDFDocument } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PreviewGenerationOptions {
  organizationId: string;
  templateId: string;
  versionId: string;
  versionNumber: number;
}

export interface PreviewGenerationResult {
  preview_file_id: string;
  preview_path: string;
  preview_bucket: string;
  preview_mime_type: string;
  preview_size_bytes: number;
}

/**
 * Generate preview for a template version
 * 
 * Strategy:
 * - For PDFs: Extract page 1 and convert to image (requires image processing library)
 * - For images: Resize to target dimensions
 * - For Office docs: Skip (not supported yet)
 * 
 * Note: This implementation uses pdf-lib for PDF extraction.
 * For production, consider adding:
 * - sharp (for image processing and PDF-to-image conversion via pdf-poppler or similar)
 * - Or use a service like pdf2pic
 */
export async function generateTemplatePreview(
  supabase: SupabaseClient,
  options: PreviewGenerationOptions
): Promise<PreviewGenerationResult> {
  const { organizationId, templateId, versionId, versionNumber } = options;

  // Step 1: Check if preview already exists (idempotency)
  const { data: existingVersion, error: versionError } = await supabase
    .from('certificate_template_versions')
    .select('preview_file_id, source_file_id, source_file:source_file_id (bucket, path, mime_type)')
    .eq('id', versionId)
    .single();

  if (versionError) {
    throw new Error(`[PreviewGenerator] Failed to fetch version: ${versionError.message} (PostgREST code: ${versionError.code || 'unknown'})`);
  }

  if (!existingVersion) {
    throw new Error(`[PreviewGenerator] Version not found: ${versionId}`);
  }

  // If preview already exists, return existing preview info
  if (existingVersion.preview_file_id) {
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('id, bucket, path, mime_type, size_bytes')
      .eq('id', existingVersion.preview_file_id)
      .single();

    if (fileError || !existingFile) {
      throw new Error(`[PreviewGenerator] Failed to fetch existing preview file: ${fileError?.message || 'Not found'}`);
    }

    return {
      preview_file_id: existingFile.id,
      preview_path: existingFile.path,
      preview_bucket: existingFile.bucket,
      preview_mime_type: existingFile.mime_type,
      preview_size_bytes: existingFile.size_bytes,
    };
  }

  const sourceFile = (existingVersion as any).source_file;
  if (!sourceFile) {
    throw new Error(`[PreviewGenerator] Source file not found for version ${versionId}`);
  }

  const sourceMimeType = sourceFile.mime_type;
  const sourcePath = sourceFile.path;
  const sourceBucket = sourceFile.bucket;

  // Step 2: Download source file from storage
  const { data: sourceFileData, error: downloadError } = await supabase.storage
    .from(sourceBucket)
    .download(sourcePath);

  if (downloadError || !sourceFileData) {
    throw new Error(`[PreviewGenerator] Failed to download source file: ${downloadError?.message || 'No data'}`);
  }

  const sourceBuffer = Buffer.from(await sourceFileData.arrayBuffer());

  // Step 3: Generate preview based on file type
  let previewBuffer: Buffer;
  let previewMimeType: string;
  let previewExtension: string;

  if (sourceMimeType === 'application/pdf') {
    // Extract first page from PDF
    // Note: pdf-lib can extract pages but can't convert to image directly
    // For production, use pdf-poppler, pdf2pic, or similar
    const pdfDoc = await PDFDocument.load(sourceBuffer);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error('[PreviewGenerator] PDF has no pages');
    }

    // Create a new PDF with just the first page
    const previewPdf = await PDFDocument.create();
    const [firstPage] = await previewPdf.copyPages(pdfDoc, [0]);
    previewPdf.addPage(firstPage);
    const previewPdfBytes = await previewPdf.save();

    // For now, we'll store the first page as a PDF
    // TODO: Convert PDF page to image using pdf-poppler, pdf2pic, or sharp
    // This requires additional dependencies or a service
    previewBuffer = Buffer.from(previewPdfBytes);
    previewMimeType = 'application/pdf'; // Temporary: should be image/webp
    previewExtension = 'pdf'; // Temporary: should be webp

    // Log warning that image conversion is needed
    console.warn('[PreviewGenerator] PDF preview stored as PDF. Image conversion requires additional library (pdf-poppler, pdf2pic, or sharp).');
  } else if (['image/png', 'image/jpeg', 'image/webp'].includes(sourceMimeType)) {
    // For images, we can use the image directly or resize
    // Without sharp, we'll use the original image for now
    // TODO: Resize to target width (1200px) using sharp or similar
    previewBuffer = sourceBuffer;
    previewMimeType = sourceMimeType === 'image/jpeg' ? 'image/jpeg' : sourceMimeType === 'image/webp' ? 'image/webp' : 'image/png';
    previewExtension = sourceMimeType === 'image/jpeg' ? 'jpg' : sourceMimeType === 'image/webp' ? 'webp' : 'png';

    // Log warning that resizing is not implemented
    if (previewBuffer.length > 1.5 * 1024 * 1024) {
      console.warn('[PreviewGenerator] Image preview is large (>1.5MB). Resizing requires sharp library.');
    }
  } else {
    // Office docs and other formats not supported yet
    throw new Error(`[PreviewGenerator] Preview generation not supported for file type: ${sourceMimeType}`);
  }

  // Step 4: Generate canonical storage path
  const { generateTemplatePreviewPath } = await import('../../lib/storage/path-validator.js');
  const previewPath = generateTemplatePreviewPath(
    organizationId,
    templateId,
    versionNumber,
    previewExtension === 'webp' ? 'webp' : previewExtension === 'png' ? 'png' : 'pdf'
  );

  // Step 5: Upload preview to storage
  const { error: uploadError } = await supabase.storage
    .from('authentix')
    .upload(previewPath, previewBuffer, {
      contentType: previewMimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`[PreviewGenerator] Failed to upload preview to storage: ${uploadError.message}`);
  }

  // Step 6: Create file registry entry
  const { computeSHA256 } = await import('../../lib/uploads/checksum.js');
  const checksum = computeSHA256(previewBuffer);

  let fileData: any;
  try {
    const { data, error: fileInsertError } = await supabase
      .from('files')
      .insert({
        organization_id: organizationId,
        bucket: 'authentix',
        path: previewPath,
        kind: 'template_preview',
        original_name: `preview.${previewExtension}`,
        mime_type: previewMimeType,
        size_bytes: previewBuffer.length,
        checksum_sha256: checksum,
      } as any)
      .select('id, bucket, path, mime_type, size_bytes')
      .single();

    if (fileInsertError || !data) {
      // Cleanup: delete uploaded file if DB insert fails
      await supabase.storage.from('authentix').remove([previewPath]);
      throw new Error(`[PreviewGenerator] Failed to create file registry entry: ${fileInsertError?.message || 'No data returned'}`);
    }

    fileData = data;
  } catch (error: any) {
    // Handle constraint violations
    if (error?.code === '23514' || error?.message?.includes('files_path_chk')) {
      await supabase.storage.from('authentix').remove([previewPath]);
      const { handleStoragePathConstraintError } = await import('../../lib/storage/path-validator.js');
      throw handleStoragePathConstraintError(error, previewPath, organizationId, templateId);
    }
    throw error;
  }

  // Step 7: Update version with preview_file_id
  const { error: updateError } = await supabase
    .from('certificate_template_versions')
    .update({ preview_file_id: fileData.id } as any)
    .eq('id', versionId);

  if (updateError) {
    // Cleanup: delete file and registry entry
    await supabase.storage.from('authentix').remove([previewPath]);
    await supabase.from('files').delete().eq('id', fileData.id);
    throw new Error(`[PreviewGenerator] Failed to update version with preview_file_id: ${updateError.message}`);
  }

  return {
    preview_file_id: fileData.id,
    preview_path: fileData.path,
    preview_bucket: fileData.bucket,
    preview_mime_type: fileData.mime_type,
    preview_size_bytes: fileData.size_bytes,
  };
}
