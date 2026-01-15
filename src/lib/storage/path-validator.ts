/**
 * STORAGE PATH VALIDATOR
 *
 * Validates storage paths against the final database design.
 * Enforces allowed storage roots and path format constraints.
 */

import { ValidationError } from '../errors/handler.js';

/**
 * Allowed storage root prefixes (final design)
 */
export const ALLOWED_STORAGE_ROOTS = [
  'org_branding',
  'certificate_templates',
  'file_imports',
  'certificates',
  'exports',
  'deliveries',
  'invoices',
] as const;

export type StorageRoot = typeof ALLOWED_STORAGE_ROOTS[number];

/**
 * Maximum path length (enforced by DB constraint)
 */
export const MAX_PATH_LENGTH = 512;

/**
 * Validate storage path format and root
 * 
 * @param path - Storage path to validate
 * @param expectedRoot - Expected root prefix (optional, for stricter validation)
 * @throws ValidationError if path is invalid
 */
export function validateStoragePath(path: string, expectedRoot?: StorageRoot): void {
  if (!path || typeof path !== 'string') {
    throw new ValidationError('Storage path is required', {
      code: 'INVALID_STORAGE_PATH',
      path: path || null,
    });
  }

  // Check length
  if (path.length > MAX_PATH_LENGTH) {
    throw new ValidationError(`Storage path exceeds maximum length of ${MAX_PATH_LENGTH} characters`, {
      code: 'INVALID_STORAGE_PATH',
      path,
      path_length: path.length,
      max_length: MAX_PATH_LENGTH,
    });
  }

  // Check if path starts with allowed root
  const pathParts = path.split('/');
  const root = pathParts[0];

  if (!ALLOWED_STORAGE_ROOTS.includes(root as StorageRoot)) {
    throw new ValidationError(
      `Storage path must start with one of the allowed roots: ${ALLOWED_STORAGE_ROOTS.join(', ')}`,
      {
        code: 'INVALID_STORAGE_PATH',
        path,
        root,
        allowed_roots: ALLOWED_STORAGE_ROOTS,
      }
    );
  }

  // If expected root is provided, validate it matches
  if (expectedRoot && root !== expectedRoot) {
    throw new ValidationError(
      `Storage path must start with expected root: ${expectedRoot}`,
      {
        code: 'INVALID_STORAGE_PATH',
        path,
        root,
        expected_root: expectedRoot,
      }
    );
  }

  // Reject legacy paths
  if (path.startsWith('org/') || path.startsWith('templates/') || path.startsWith('minecertificate/')) {
    throw new ValidationError(
      'Legacy storage paths are not allowed. Use allowed storage roots instead.',
      {
        code: 'LEGACY_STORAGE_PATH',
        path,
        allowed_roots: ALLOWED_STORAGE_ROOTS,
      }
    );
  }
}

/**
 * Generate canonical template source file path
 * Format: certificate_templates/<org_id>/<template_id>/source.<ext>
 *
 * @param organizationId - Organization UUID
 * @param templateId - Template UUID
 * @param extension - File extension (without dot)
 * @returns Validated storage path
 */
export function generateTemplateSourcePath(
  organizationId: string,
  templateId: string,
  extension: string
): string {
  // Validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(organizationId)) {
    throw new ValidationError('Invalid organization ID format', {
      code: 'INVALID_UUID',
      field: 'organizationId',
    });
  }
  if (!uuidRegex.test(templateId)) {
    throw new ValidationError('Invalid template ID format', {
      code: 'INVALID_UUID',
      field: 'templateId',
    });
  }

  // Validate extension
  if (!extension || typeof extension !== 'string' || extension.includes('/') || extension.includes('.')) {
    throw new ValidationError('Invalid file extension', {
      code: 'INVALID_EXTENSION',
      extension,
    });
  }

  // Generate path
  const path = `certificate_templates/${organizationId}/${templateId}/source.${extension}`;

  // Validate generated path
  validateStoragePath(path, 'certificate_templates');

  return path;
}

/**
 * Generate canonical template preview file path
 * Format: certificate_templates/<org_id>/<template_id>/preview.<format>
 *
 * @param organizationId - Organization UUID
 * @param templateId - Template UUID
 * @param format - Preview format ('webp' | 'png' | 'pdf')
 * @returns Validated storage path
 */
export function generateTemplatePreviewPath(
  organizationId: string,
  templateId: string,
  format: 'webp' | 'png' | 'pdf' = 'webp'
): string {
  // Validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(organizationId)) {
    throw new ValidationError('Invalid organization ID format', {
      code: 'INVALID_UUID',
      field: 'organizationId',
    });
  }
  if (!uuidRegex.test(templateId)) {
    throw new ValidationError('Invalid template ID format', {
      code: 'INVALID_UUID',
      field: 'templateId',
    });
  }

  // Generate path
  const path = `certificate_templates/${organizationId}/${templateId}/preview.${format}`;

  // Validate generated path
  validateStoragePath(path, 'certificate_templates');

  return path;
}

/**
 * Extract file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  };

  return mimeToExt[mimeType] || 'bin';
}

/**
 * Handle Postgres constraint errors and provide user-friendly messages
 */
export function handleStoragePathConstraintError(
  error: any,
  attemptedPath: string,
  organizationId?: string,
  templateId?: string
): Error {
  // Check if it's a constraint violation
  if (error?.code === '23514' || error?.message?.includes('files_path_chk')) {
    const validationError = new ValidationError(
      'Storage path does not match allowed format. Path must start with one of the allowed storage roots.',
      {
        code: 'STORAGE_PATH_CONSTRAINT_VIOLATION',
        attempted_path: attemptedPath,
        organization_id: organizationId,
        template_id: templateId,
        allowed_roots: ALLOWED_STORAGE_ROOTS,
        hint: 'Ensure the path starts with: ' + ALLOWED_STORAGE_ROOTS.join(', '),
      }
    );

    // Log detailed error for debugging
    console.error('[StoragePathValidator] Constraint violation:', {
      error_code: error.code,
      error_message: error.message,
      attempted_path: attemptedPath,
      organization_id: organizationId,
      template_id: templateId,
      constraint: 'files_path_chk',
    });

    return validationError;
  }

  // Return original error if not a constraint violation
  return error instanceof Error ? error : new Error(String(error));
}
