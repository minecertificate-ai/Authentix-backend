/**
 * WEBHOOK TYPES
 *
 * Domain types for webhook processing.
 */

/**
 * Razorpay webhook event
 */
export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: { entity: Record<string, unknown> };
    invoice?: { entity: Record<string, unknown> };
    refund?: { entity: Record<string, unknown> };
    order?: { entity: Record<string, unknown> };
  };
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  received: boolean;
  stored: boolean;
  processed: boolean;
  event_db_id?: string;
  event_type?: string;
  duplicate?: boolean;
  error?: string;
}
