/**
 * ID UTILITIES
 *
 * Generate application IDs and API keys.
 */

import { randomBytes } from 'node:crypto';

/**
 * Generate application ID: xen_<env>_<base32>
 */
export function generateApplicationId(): string {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'test';
  const random = randomBytes(10);
  const base32 = random.toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .substring(0, 16)
    .toLowerCase();
  
  return `xen_${env}_${base32}`;
}

/**
 * Generate API key: xen_<env>_live_<base64url>
 */
export function generateAPIKey(): string {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'test';
  const random = randomBytes(32);
  const base64url = random.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `xen_${env}_live_${base64url}`;
}

/**
 * Hash API key using SHA-256
 * 
 * Note: SHA-256 is used for API key hashing (deterministic, fast verification).
 * Alternative approaches (HMAC-SHA256 with secret or bcrypt) are possible but
 * SHA-256 is standard for API key storage and provides adequate security.
 * The plaintext API key is generated once during bootstrap and never stored.
 * 
 * @param apiKey - Plaintext API key to hash
 * @returns SHA-256 hash as hex string (never null/undefined)
 * @throws Error if apiKey is null/undefined/empty
 */
export async function hashAPIKey(apiKey: string): Promise<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('hashAPIKey: apiKey must be a non-empty string');
  }
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(apiKey).digest('hex');
  if (!hash || hash.length === 0) {
    throw new Error('hashAPIKey: Failed to generate hash');
  }
  return hash;
}

/**
 * Verify API key against hash
 */
export async function verifyAPIKey(apiKey: string, hash: string): Promise<boolean> {
  const computedHash = await hashAPIKey(apiKey);
  return computedHash === hash;
}

/**
 * Validate application ID format
 */
export function validateApplicationId(applicationId: string): boolean {
  return /^xen_(prod|test)_[a-z0-9]{16}$/.test(applicationId);
}

/**
 * Validate API key format
 */
export function validateAPIKey(apiKey: string): boolean {
  return /^xen_(prod|test)_live_[A-Za-z0-9_-]+$/.test(apiKey);
}
