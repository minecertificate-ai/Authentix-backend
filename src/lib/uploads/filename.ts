/**
 * FILENAME SANITIZATION
 *
 * Generates secure filenames for uploads.
 * Never trusts client-provided filenames (prevents path traversal, injection).
 *
 * OWASP approach:
 * - Generate UUID-based filenames
 * - Derive extension from validated file type (not client input)
 * - Store original filename in database metadata only (never in filesystem)
 */

import { randomUUID } from 'node:crypto';

/**
 * Extension map from validated mimetypes
 * Only use extensions from validated file types
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
};

/**
 * Generate secure storage filename
 *
 * @param validatedMimeType - MIME type after magic byte validation
 * @returns Secure filename with proper extension
 *
 * @example
 * generateSecureFilename('image/png')
 * // Returns: '550e8400-e29b-41d4-a716-446655440000.png'
 */
export function generateSecureFilename(validatedMimeType: string): string {
  const uuid = randomUUID();
  const extension = MIME_TO_EXTENSION[validatedMimeType] ?? 'bin';

  return `${uuid}.${extension}`;
}

/**
 * Generate secure storage path for company-scoped uploads
 *
 * @param bucket - Storage bucket (e.g., 'templates', 'imports', 'certificates')
 * @param companyId - Company UUID
 * @param validatedMimeType - MIME type after validation
 * @returns Full storage path
 *
 * @example
 * generateStoragePath('templates', 'company-123', 'application/pdf')
 * // Returns: 'templates/company-123/550e8400-e29b-41d4-a716-446655440000.pdf'
 */
export function generateStoragePath(
  bucket: string,
  companyId: string,
  validatedMimeType: string
): string {
  const filename = generateSecureFilename(validatedMimeType);
  return `${bucket}/${companyId}/${filename}`;
}

/**
 * Sanitize client filename for database storage (metadata only)
 * NEVER use this for actual filesystem paths
 *
 * @param clientFilename - Filename provided by client
 * @returns Sanitized filename (safe for database storage)
 *
 * @example
 * sanitizeClientFilename('../../../etc/passwd')
 * // Returns: 'passwd'
 */
export function sanitizeClientFilename(clientFilename: string): string {
  if (!clientFilename) {
    return 'unnamed';
  }

  // Remove path components
  const basename = clientFilename.split(/[\\/]/).pop() ?? 'unnamed';

  // Remove non-alphanumeric characters (keep dots, dashes, underscores)
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Limit length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    // Keep extension if present
    const parts = sanitized.split('.');
    if (parts.length > 1) {
      const ext = parts.pop();
      const name = parts.join('.');
      const truncatedName = name.substring(0, maxLength - (ext?.length ?? 0) - 1);
      return `${truncatedName}.${ext}`;
    }
    return sanitized.substring(0, maxLength);
  }

  return sanitized || 'unnamed';
}

/**
 * Extract file extension from client filename (for display only)
 * DO NOT use for validation or storage path generation
 */
export function extractClientExtension(clientFilename: string): string | null {
  const sanitized = sanitizeClientFilename(clientFilename);
  const parts = sanitized.split('.');

  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() ?? null;
  }

  return null;
}
