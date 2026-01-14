/**
 * FILE UPLOAD VALIDATOR
 *
 * Validates file uploads using magic byte detection.
 * Prevents attacks where malicious files are disguised with fake extensions/mimetypes.
 *
 * Security approach (OWASP File Upload Cheat Sheet):
 * 1. Check client mimetype (quick reject)
 * 2. Validate magic bytes (actual file content)
 * 3. Reject mismatches
 */

import { fileTypeFromBuffer } from 'file-type';
import { ValidationError } from '../errors/handler.js';

/**
 * Allowed file types with their expected magic bytes
 */
export const ALLOWED_FILE_TYPES = {
  // Images
  'image/png': { extension: 'png', description: 'PNG image' },
  'image/jpeg': { extension: 'jpg', description: 'JPEG image' },
  'image/webp': { extension: 'webp', description: 'WebP image' },

  // Documents
  'application/pdf': { extension: 'pdf', description: 'PDF document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: 'docx',
    description: 'Word document',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    extension: 'pptx',
    description: 'PowerPoint presentation',
  },

  // Spreadsheets (for imports)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extension: 'xlsx',
    description: 'Excel spreadsheet',
  },
  'text/csv': { extension: 'csv', description: 'CSV file' },
} as const;

/**
 * File upload validation result
 */
export interface FileValidationResult {
  isValid: boolean;
  detectedType: string;
  expectedType: string;
  extension: string;
}

/**
 * Validate file upload
 *
 * @param buffer - File buffer
 * @param clientMimetype - Mimetype claimed by client
 * @param allowedTypes - Array of allowed mimetypes
 * @returns Validation result
 * @throws ValidationError if file is invalid
 */
export async function validateFileUpload(
  buffer: Buffer,
  clientMimetype: string,
  allowedTypes: readonly string[]
): Promise<FileValidationResult> {
  // Step 1: Quick check - is client mimetype in allowlist?
  if (!allowedTypes.includes(clientMimetype)) {
    throw new ValidationError(
      `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      { clientMimetype, allowedTypes }
    );
  }

  // Step 2: Detect actual file type from magic bytes
  // Read first 4100 bytes (sufficient for most file type detection)
  const fileTypeResult = await fileTypeFromBuffer(buffer.slice(0, 4100));

  // Handle CSV (no magic bytes, check content)
  if (clientMimetype === 'text/csv') {
    const isValidCSV = validateCSVContent(buffer.toString('utf-8', 0, 1000));
    if (!isValidCSV) {
      throw new ValidationError(
        'File content does not match declared CSV type',
        { clientMimetype, detectedType: 'unknown' }
      );
    }

    return {
      isValid: true,
      detectedType: 'text/csv',
      expectedType: clientMimetype,
      extension: 'csv',
    };
  }

  // Handle Office Open XML formats (XLSX, DOCX, PPTX - all ZIP archives)
  const officeXmlTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  ];
  
  if (officeXmlTypes.includes(clientMimetype)) {
    // Office XML files are ZIP archives starting with PK
    if (!buffer.slice(0, 2).equals(Buffer.from([0x50, 0x4B]))) {
      throw new ValidationError(
        `File content does not match declared ${clientMimetype} type`,
        { clientMimetype, detectedType: fileTypeResult?.mime ?? 'unknown' }
      );
    }

    const extensionMap: Record<string, string> = {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    };

    return {
      isValid: true,
      detectedType: clientMimetype,
      expectedType: clientMimetype,
      extension: extensionMap[clientMimetype] || 'bin',
    };
  }

  // Step 3: Verify magic bytes match allowed type
  if (!fileTypeResult) {
    throw new ValidationError(
      'Could not detect file type from content. File may be corrupted or invalid.',
      { clientMimetype }
    );
  }

  // Step 4: Check if detected type is in allowlist
  const allowedMimeTypes = Object.keys(ALLOWED_FILE_TYPES);
  if (!allowedMimeTypes.includes(fileTypeResult.mime)) {
    throw new ValidationError(
      `File content type not allowed: ${fileTypeResult.mime}`,
      {
        clientMimetype,
        detectedType: fileTypeResult.mime,
        allowedTypes: allowedMimeTypes,
      }
    );
  }

  // Step 5: Verify client mimetype matches detected type
  // Allow some tolerance (e.g., image/jpg vs image/jpeg)
  const normalizedClient = normalizeMimeType(clientMimetype);
  const normalizedDetected = normalizeMimeType(fileTypeResult.mime);

  if (normalizedClient !== normalizedDetected) {
    throw new ValidationError(
      'File content does not match declared type. Possible file spoofing attempt.',
      {
        clientMimetype,
        detectedType: fileTypeResult.mime,
      }
    );
  }

  // Get extension from detected type
  const typeInfo = ALLOWED_FILE_TYPES[fileTypeResult.mime as keyof typeof ALLOWED_FILE_TYPES];

  return {
    isValid: true,
    detectedType: fileTypeResult.mime,
    expectedType: clientMimetype,
    extension: typeInfo?.extension ?? fileTypeResult.ext,
  };
}

/**
 * Normalize mimetype for comparison
 * Handles common variations (e.g., image/jpg -> image/jpeg)
 */
function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim();

  // Common variations
  if (normalized === 'image/jpg') return 'image/jpeg';

  return normalized;
}

/**
 * Validate CSV content (basic check)
 * Looks for comma-separated values pattern
 */
function validateCSVContent(content: string): boolean {
  // Check for at least one comma-separated line
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return false;

  // Check first line has commas
  const firstLine = lines[0];
  return firstLine ? firstLine.includes(',') : false;
}

/**
 * Get file extension from validated file type
 */
export function getFileExtension(mimeType: string): string {
  const typeInfo = ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES];
  return typeInfo?.extension ?? 'bin';
}
