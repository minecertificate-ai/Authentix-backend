/**
 * BILLING REPOSITORY
 *
 * Data access layer for invoices and billing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceEntity, InvoiceLineItemEntity, InvoiceStatus } from './types.js';

export class BillingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Find invoice by ID
   */
  async findInvoiceById(id: string, companyId: string): Promise<InvoiceEntity | null> {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find invoice: ${error.message}`);
    }

    return data ? this.mapToInvoiceEntity(data) : null;
  }

  /**
   * Find all invoices for company
   */
  async findInvoices(
    companyId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ data: InvoiceEntity[]; count: number }> {
    let query = this.supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .is('deleted_at', null);

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.sortBy) {
      query = query.order(options.sortBy, {
        ascending: options.sortOrder === 'asc',
      });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 20) - 1
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to find invoices: ${error.message}`);
    }

    return {
      data: (data ?? []).map((item) => this.mapToInvoiceEntity(item)),
      count: count ?? 0,
    };
  }

  /**
   * Get invoice line items
   */
  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItemEntity[]> {
    const { data, error } = await this.supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get line items: ${error.message}`);
    }

    return (data ?? []).map((item) => this.mapToLineItemEntity(item));
  }

  /**
   * Get billing profile
   */
  async getBillingProfile(companyId: string): Promise<{
    platform_fee_amount: number;
    certificate_unit_price: number;
    gst_rate: number;
    currency: string;
  } | null> {
    const { data, error } = await this.supabase
      .from('billing_profiles')
      .select('platform_fee_amount, certificate_unit_price, gst_rate, currency')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get billing profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get unbilled certificate count
   */
  async getUnbilledCertificateCount(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('issued_at', startDate)
      .lte('issued_at', endDate)
      .is('invoice_id', null)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to get certificate count: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Map database row to invoice entity
   */
  private mapToInvoiceEntity(row: Record<string, unknown>): InvoiceEntity {
    return {
      id: row.id as string,
      company_id: row.company_id as string,
      invoice_number: row.invoice_number as string,
      period_start: row.period_start as string,
      period_end: row.period_end as string,
      subtotal: Number(row.subtotal),
      tax_amount: Number(row.tax_amount),
      total_amount: Number(row.total_amount),
      currency: (row.currency as string) ?? 'INR',
      status: (row.status as InvoiceStatus) ?? 'pending',
      razorpay_invoice_id: row.razorpay_invoice_id as string | null,
      razorpay_payment_link: row.razorpay_payment_link as string | null,
      razorpay_status: row.razorpay_status as string | null,
      due_date: row.due_date as string,
      paid_at: row.paid_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      deleted_at: row.deleted_at as string | null,
    };
  }

  /**
   * Map database row to line item entity
   */
  private mapToLineItemEntity(row: Record<string, unknown>): InvoiceLineItemEntity {
    return {
      id: row.id as string,
      invoice_id: row.invoice_id as string,
      description: row.description as string,
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
      amount: Number(row.amount),
      certificate_id: row.certificate_id as string | null,
      created_at: row.created_at as string,
    };
  }
}
