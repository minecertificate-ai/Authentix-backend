/**
 * COOKIE CONFIGURATION
 *
 * Secure cookie settings for authentication tokens.
 * - HttpOnly: Prevents XSS attacks
 * - Secure: HTTPS only in production
 * - SameSite: CSRF protection
 */

import type { FastifyReply } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { isProduction } from '../config/env.js';

/**
 * Cookie names
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  CSRF_TOKEN: '_csrf',
} as const;

/**
 * Get secure cookie options for authentication tokens
 */
export function getAuthCookieOptions(maxAge?: number): CookieSerializeOptions {
  return {
    httpOnly: true, // Prevent JavaScript access (XSS protection)
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax', // CSRF protection (allows top-level navigation)
    path: '/', // Available to all routes
    maxAge: maxAge ?? 3600, // Default 1 hour (in seconds)
    domain: undefined, // Use default (current domain)
  };
}

/**
 * Get cookie options for CSRF token
 * CSRF token needs to be readable by JavaScript
 */
export function getCSRFCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: false, // JavaScript needs to read this
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600, // 1 hour
  };
}

/**
 * Set authentication cookies on reply
 */
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): void {
  // Calculate maxAge from expiresAt if provided
  let maxAge: number | undefined;
  if (expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    maxAge = Math.max(0, expiresAt - now);
  }

  // Set access token cookie
  reply.setCookie(
    COOKIE_NAMES.ACCESS_TOKEN,
    accessToken,
    getAuthCookieOptions(maxAge)
  );

  // Set refresh token cookie if provided
  if (refreshToken) {
    reply.setCookie(
      COOKIE_NAMES.REFRESH_TOKEN,
      refreshToken,
      {
        ...getAuthCookieOptions(maxAge ? maxAge * 2 : 7200), // Refresh token lives 2x longer
        path: '/api/v1/auth/refresh', // Only sent to refresh endpoint
      }
    );
  }
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: '/' });
  reply.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: '/api/v1/auth/refresh' });
  reply.clearCookie(COOKIE_NAMES.CSRF_TOKEN, { path: '/' });
}

/**
 * Extract token from cookie
 */
export function getTokenFromCookies(cookies: Record<string, string>): string | undefined {
  return cookies[COOKIE_NAMES.ACCESS_TOKEN];
}
