/**
 * BILLING TYPES
 *
 * Domain types for billing and invoice management.
 */

import { z } from 'zod';

/**
 * Billing period
 */
export interface BillingPeriod {
  start: Date;
  end: Date;
  month: number; // 1-12
  year: number;
  label: string; // "January 2025"
}

/**
 * Invoice status
 */
export const invoiceStatusSchema = z.enum([
  'pending',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
  'failed',
]);

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/**
 * Invoice entity
 */
export interface InvoiceEntity {
  id: string;
  company_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: InvoiceStatus;
  razorpay_invoice_id: string | null;
  razorpay_payment_link: string | null;
  razorpay_status: string | null;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Invoice line item entity
 */
export interface InvoiceLineItemEntity {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  certificate_id: string | null;
  created_at: string;
}

/**
 * Billing overview response
 */
export interface BillingOverview {
  billing_profile: {
    id: string;
    company_id: string;
    platform_fee_amount: number;
    certificate_unit_price: number;
    gst_rate: number;
    currency: string;
    razorpay_customer_id: string | null;
    created_at: string;
    updated_at: string;
  };
  current_usage: {
    certificate_count: number;
    platform_fee: number;
    usage_cost: number;
    subtotal: number;
    gst_amount: number;
    estimated_total: number;
    currency: string;
    gst_rate: number;
  };
  current_period: {
    certificate_count: number;
    estimated_amount: number;
  };
  recent_invoices: InvoiceEntity[];
  total_outstanding: number;
}
