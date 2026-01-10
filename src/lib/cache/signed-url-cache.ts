/**
 * SIGNED URL CACHE
 *
 * In-memory cache for Supabase Storage signed URLs.
 * Prevents redundant signing requests for the same files.
 *
 * Performance impact:
 * - Reduces Supabase Storage API calls
 * - Faster template list responses
 */

import { LRUCache } from 'lru-cache';
import { config } from '../config/env.js';

/**
 * Cached signed URL with metadata
 */
export interface CachedSignedUrl {
  url: string;
  expiresAt: number; // Unix timestamp (seconds)
  cachedAt: number; // Unix timestamp (ms)
}

/**
 * LRU Cache for signed URLs
 * - Max 2000 entries (should cover most common files)
 * - TTL based on URL expiration with safety margin
 */
const signedUrlCache = new LRUCache<string, CachedSignedUrl>({
  max: 2000,
  // TTL is dynamic per entry (set when caching)
  updateAgeOnGet: true,
});

/**
 * Generate cache key for storage path
 */
export function generateSignedUrlCacheKey(storagePath: string): string {
  return `signed-url:${storagePath}`;
}

/**
 * Calculate TTL for signed URL cache
 * Returns expiration time minus safety margin (5 minutes)
 */
export function calculateSignedUrlTTL(expiresIn: number): number {
  const safetyMarginSeconds = 300; // 5 minutes
  const effectiveTTL = Math.max(0, expiresIn - safetyMarginSeconds);
  return effectiveTTL * 1000; // Convert to milliseconds
}

/**
 * Get cached signed URL
 * Returns null if not cached or expired
 */
export function getCachedSignedUrl(storagePath: string): string | null {
  if (!config.SIGNED_URL_CACHE_ENABLED) {
    return null;
  }

  const cacheKey = generateSignedUrlCacheKey(storagePath);
  const cached = signedUrlCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  // Double-check expiration
  const now = Math.floor(Date.now() / 1000);
  if (cached.expiresAt <= now) {
    signedUrlCache.delete(cacheKey);
    return null;
  }

  return cached.url;
}

/**
 * Cache signed URL
 */
export function setCachedSignedUrl(
  storagePath: string,
  signedUrl: string,
  expiresIn: number // Expiration time in seconds
): void {
  if (!config.SIGNED_URL_CACHE_ENABLED) {
    return;
  }

  const cacheKey = generateSignedUrlCacheKey(storagePath);
  const ttl = calculateSignedUrlTTL(expiresIn);

  // Only cache if TTL is positive
  if (ttl > 0) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    signedUrlCache.set(cacheKey, {
      url: signedUrl,
      expiresAt,
      cachedAt: Date.now(),
    }, { ttl });
  }
}

/**
 * Batch cache signed URLs
 */
export function setCachedSignedUrls(
  urlMap: Map<string, { url: string; expiresIn: number }>
): void {
  if (!config.SIGNED_URL_CACHE_ENABLED) {
    return;
  }

  urlMap.forEach((data, storagePath) => {
    setCachedSignedUrl(storagePath, data.url, data.expiresIn);
  });
}

/**
 * Invalidate cached signed URL
 * Useful when file is deleted or updated
 */
export function invalidateSignedUrl(storagePath: string): void {
  const cacheKey = generateSignedUrlCacheKey(storagePath);
  signedUrlCache.delete(cacheKey);
}

/**
 * Clear all signed URL cache (useful for testing)
 */
export function clearAllSignedUrlCache(): void {
  signedUrlCache.clear();
}

/**
 * Get cache statistics (for monitoring)
 */
export function getSignedUrlCacheStats() {
  return {
    size: signedUrlCache.size,
    maxSize: 2000,
    enabled: config.SIGNED_URL_CACHE_ENABLED,
  };
}
