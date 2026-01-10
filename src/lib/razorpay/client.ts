/**
 * RAZORPAY CLIENT
 *
 * Wrapper for Razorpay API.
 * Handles environment-specific credentials (test vs prod).
 */

import Razorpay from 'razorpay';

let razorpayClient: Razorpay | null = null;

/**
 * Get runtime environment
 */
function getEnvironment(): 'test' | 'prod' {
  const env = process.env.NODE_ENV ?? process.env.VERCEL_ENV;
  
  if (env === 'production' || env === 'prod') {
    return 'prod';
  }
  
  return 'test';
}

/**
 * Get Razorpay client for current environment
 *
 * @returns Razorpay instance
 */
export function getRazorpayClient(): Razorpay {
  if (razorpayClient) {
    return razorpayClient;
  }

  const env = getEnvironment();

  const keyId =
    env === 'prod'
      ? process.env.RAZORPAY_KEY_ID_PROD
      : process.env.RAZORPAY_KEY_ID_TEST;

  const keySecret =
    env === 'prod'
      ? process.env.RAZORPAY_KEY_SECRET_PROD
      : process.env.RAZORPAY_KEY_SECRET_TEST;

  if (!keyId || !keySecret) {
    throw new Error(
      `Razorpay credentials not configured for environment: ${env}`
    );
  }

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayClient;
}

/**
 * Get Razorpay webhook secret for current environment
 *
 * @returns Webhook secret
 */
export function getRazorpayWebhookSecret(): string {
  const env = getEnvironment();

  const secret =
    env === 'prod'
      ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD
      : process.env.RAZORPAY_WEBHOOK_SECRET_TEST;

  if (!secret) {
    throw new Error(
      `Razorpay webhook secret not configured for environment: ${env}`
    );
  }

  return secret;
}
