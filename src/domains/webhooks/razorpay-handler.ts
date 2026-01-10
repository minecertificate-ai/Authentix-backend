/**
 * RAZORPAY WEBHOOK HANDLER
 *
 * Handles Razorpay webhook events with signature verification and processing.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRazorpayWebhookSecret } from '../../lib/razorpay/client.js';
import type { RazorpayWebhookEvent, WebhookProcessingResult } from './types.js';

/**
 * Verify Razorpay webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('[Razorpay Webhook] Signature verification error:', error);
    return false;
  }
}

/**
 * Extract entity details from webhook payload
 */
export function extractEntityDetails(payload: RazorpayWebhookEvent): {
  entityType: string | null;
  entityId: string | null;
  entity: Record<string, unknown> | null;
} {
  const entityTypes = ['payment', 'invoice', 'refund', 'order'];

  for (const type of entityTypes) {
    const entity = payload.payload[type as keyof typeof payload.payload] as
      | { entity: Record<string, unknown> }
      | undefined;

    if (entity?.entity) {
      return {
        entityType: type,
        entityId: (entity.entity.id as string) ?? null,
        entity: entity.entity,
      };
    }
  }

  return {
    entityType: null,
    entityId: null,
    entity: null,
  };
}

/**
 * Resolve company_id from webhook metadata
 */
export function resolveCompanyId(payload: RazorpayWebhookEvent): string | null {
  try {
    const invoiceNotes = payload.payload.invoice?.entity?.notes as Record<string, unknown> | undefined;
    const invoiceCompanyId = invoiceNotes?.company_id;
    if (invoiceCompanyId) return invoiceCompanyId as string;

    const paymentNotes = payload.payload.payment?.entity?.notes as Record<string, unknown> | undefined;
    const paymentCompanyId = paymentNotes?.company_id;
    if (paymentCompanyId) return paymentCompanyId as string;

    const orderNotes = payload.payload.order?.entity?.notes as Record<string, unknown> | undefined;
    const orderCompanyId = orderNotes?.company_id;
    if (orderCompanyId) return orderCompanyId as string;

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve invoice_id from webhook metadata
 */
export function resolveInvoiceId(payload: RazorpayWebhookEvent): string | null {
  try {
    const invoiceNotes = payload.payload.invoice?.entity?.notes as Record<string, unknown> | undefined;
    const invoiceId = invoiceNotes?.invoice_id;
    if (invoiceId) return invoiceId as string;

    const paymentNotes = payload.payload.payment?.entity?.notes as Record<string, unknown> | undefined;
    const paymentInvoiceId = paymentNotes?.invoice_id;
    if (paymentInvoiceId) return paymentInvoiceId as string;

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if event is billing-critical
 */
export function isBillingCriticalEvent(eventType: string): boolean {
  const criticalEvents = [
    'invoice.created',
    'invoice.issued',
    'invoice.paid',
    'invoice.expired',
    'invoice.cancelled',
    'invoice.partially_paid',
    'payment.captured',
    'payment.failed',
    'refund.processed',
  ];

  return criticalEvents.includes(eventType);
}

/**
 * Process billing-critical event
 */
async function processBillingCriticalEvent(
  supabase: SupabaseClient,
  eventType: string,
  _entity: Record<string, unknown>,
  companyId: string | null,
  invoiceId: string | null
): Promise<Record<string, unknown>> {
  if (!companyId) {
    throw new Error('Cannot process event: company_id not found');
  }

  if (!invoiceId && eventType.startsWith('invoice.')) {
    throw new Error('Cannot process invoice event: invoice_id not found');
  }

  switch (eventType) {
    case 'invoice.paid':
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          razorpay_status: 'paid',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('company_id', companyId);

      return { action: 'invoice_marked_paid', invoice_id: invoiceId };

    case 'invoice.expired':
      await supabase
        .from('invoices')
        .update({
          status: 'overdue',
          razorpay_status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('company_id', companyId);

      return { action: 'invoice_marked_overdue', invoice_id: invoiceId };

    case 'invoice.cancelled':
      await supabase
        .from('invoices')
        .update({
          status: 'cancelled',
          razorpay_status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('company_id', companyId);

      return { action: 'invoice_cancelled', invoice_id: invoiceId };

    default:
      return { action: 'logged_only', event_type: eventType };
  }
}

/**
 * Process Razorpay webhook
 */
export async function processRazorpayWebhook(
  supabase: SupabaseClient,
  payload: RazorpayWebhookEvent,
  signature: string
): Promise<WebhookProcessingResult> {
  // Get webhook secret
  const secret = getRazorpayWebhookSecret();

  // Verify signature
  const payloadString = JSON.stringify(payload);
  const isValid = verifyWebhookSignature(payloadString, signature, secret);

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  // Extract event details
  const eventType = payload.event;
  const { entityType, entityId, entity } = extractEntityDetails(payload);
  const companyId = resolveCompanyId(payload);
  const invoiceId = resolveInvoiceId(payload);

  // Get Razorpay event ID
  const razorpayEventId =
    (entity?.id as string) ??
    (payload.payload.invoice?.entity?.id as string) ??
    null;

  // Check for idempotency
  if (razorpayEventId) {
    const { data: existingEvent } = await supabase
      .from('razorpay_events')
      .select('id, processed')
      .eq('razorpay_event_id', razorpayEventId)
      .maybeSingle();

    if (existingEvent) {
      return {
        received: true,
        stored: false,
        processed: existingEvent.processed ?? false,
        duplicate: true,
        event_type: eventType,
      };
    }
  }

  // Store event
  const { data: storedEvent, error: storeError } = await supabase
    .from('razorpay_events')
    .insert({
      event_type: eventType,
      razorpay_event_id: razorpayEventId,
      payload: payload as unknown as Record<string, unknown>,
      entity_type: entityType,
      entity_id: entityId,
      company_id: companyId,
      invoice_id: invoiceId,
      processed: false,
      signature_verified: true,
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (storeError) {
    throw new Error(`Failed to store event: ${storeError.message}`);
  }

  const eventDbId = storedEvent.id;

  // Process if billing-critical
  const isCritical = isBillingCriticalEvent(eventType);
  if (!isCritical) {
    return {
      received: true,
      stored: true,
      processed: false,
      event_db_id: eventDbId,
      event_type: eventType,
    };
  }

  // Process critical event
  try {
    await processBillingCriticalEvent(
      supabase,
      eventType,
      entity ?? {},
      companyId,
      invoiceId
    );

    // Mark as processed
    await supabase
      .from('razorpay_events')
      .update({ processed: true })
      .eq('id', eventDbId);

    return {
      received: true,
      stored: true,
      processed: true,
      event_db_id: eventDbId,
      event_type: eventType,
    };
  } catch (error) {
    console.error('[Razorpay Webhook] Processing failed:', error);
    return {
      received: true,
      stored: true,
      processed: false,
      event_db_id: eventDbId,
      event_type: eventType,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
