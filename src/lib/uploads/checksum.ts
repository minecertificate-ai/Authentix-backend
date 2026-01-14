/**
 * FILE CHECKSUM UTILITIES
 *
 * Computes file checksums for integrity verification.
 */

import { createHash } from 'node:crypto';

/**
 * Compute SHA256 checksum of a buffer
 */
export function computeSHA256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
