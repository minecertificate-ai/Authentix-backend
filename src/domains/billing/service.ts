/**
 * BILLING SERVICE
 *
 * Business logic for billing and invoice management.
 */

import type { BillingRepository } from './repository.js';
import type { InvoiceEntity, InvoiceLineItemEntity, BillingOverview, BillingPeriod } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

/**
 * Get billing period for previous month
 */
export function getPreviousMonthBillingPeriod(referenceDate: Date = new Date()): BillingPeriod {
  const firstDayOfCurrentMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );

  const lastMomentOfPreviousMonth = new Date(firstDayOfCurrentMonth.getTime() - 1);

  const firstDayOfPreviousMonth = new Date(
    lastMomentOfPreviousMonth.getFullYear(),
    lastMomentOfPreviousMonth.getMonth(),
    1,
    0, 0, 0, 0
  );

  const lastDayOfPreviousMonth = new Date(
    lastMomentOfPreviousMonth.getFullYear(),
    lastMomentOfPreviousMonth.getMonth() + 1,
    0,
    23, 59, 59, 999
  );

  const month = firstDayOfPreviousMonth.getMonth() + 1;
  const year = firstDayOfPreviousMonth.getFullYear();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return {
    start: firstDayOfPreviousMonth,
    end: lastDayOfPreviousMonth,
    month,
    year,
    label: `${monthNames[firstDayOfPreviousMonth.getMonth()]} ${year}`,
  };
}

export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  /**
   * Get invoice by ID
   */
  async getInvoice(id: string, companyId: string): Promise<InvoiceEntity> {
    const invoice = await this.repository.findInvoiceById(id, companyId);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    return invoice;
  }

  /**
   * List invoices
   */
  async listInvoices(
    companyId: string,
    options: {
      status?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ invoices: InvoiceEntity[]; total: number }> {
    const limit = options.limit ?? 20;
    const page = options.page ?? 1;
    const offset = (page - 1) * limit;

    const { data, count } = await this.repository.findInvoices(companyId, {
      status: options.status,
      limit,
      offset,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
    });

    return {
      invoices: data,
      total: count,
    };
  }

  /**
   * Get invoice with line items
   */
  async getInvoiceWithLineItems(
    id: string,
    companyId: string
  ): Promise<{
    invoice: InvoiceEntity;
    line_items: InvoiceLineItemEntity[];
  }> {
    const invoice = await this.getInvoice(id, companyId);
    const lineItems = await this.repository.getInvoiceLineItems(id);

    return {
      invoice,
      line_items: lineItems,
    };
  }

  /**
   * Get billing overview
   */
  async getBillingOverview(companyId: string): Promise<BillingOverview> {
    // Get current period (current month for usage calculation)
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const currentStartDate = currentMonthStart.toISOString();
    const currentEndDate = currentMonthEnd.toISOString();

    // Get previous month period (for billing)
    const period = getPreviousMonthBillingPeriod();
    const startDate = period.start.toISOString();
    const endDate = period.end.toISOString();

    // Get billing profile
    const profile = await this.repository.getBillingProfile(companyId);
    if (!profile) {
      throw new NotFoundError('Billing profile not found');
    }

    // Get current month unbilled certificate count (for usage display)
    const currentCertificateCount = await this.repository.getUnbilledCertificateCount(
      companyId,
      currentStartDate,
      currentEndDate
    );

    // Calculate current month usage
    const platformFee = profile.platform_fee_amount;
    const usageCost = currentCertificateCount * profile.certificate_unit_price;
    const subtotal = platformFee + usageCost;
    const gstAmount = subtotal * (profile.gst_rate / 100);
    const estimatedTotal = subtotal + gstAmount;

    // Get previous month unbilled certificate count (for billing period)
    const certificateCount = await this.repository.getUnbilledCertificateCount(
      companyId,
      startDate,
      endDate
    );

    // Calculate estimated amount for previous month
    const certificateAmount = certificateCount * profile.certificate_unit_price;
    const periodSubtotal = platformFee + certificateAmount;
    const periodTaxAmount = periodSubtotal * (profile.gst_rate / 100);
    const estimatedAmount = periodSubtotal + periodTaxAmount;

    // Get recent invoices
    const { invoices } = await this.listInvoices(companyId, {
      limit: 5,
    });

    // Calculate total outstanding
    const outstandingInvoices = invoices.filter(
      (inv) => inv.status === 'pending' || inv.status === 'overdue'
    );
    const totalOutstanding = outstandingInvoices.reduce(
      (sum, inv) => sum + inv.total_amount,
      0
    );

    return {
      billing_profile: {
        id: profile.id,
        company_id: profile.company_id,
        platform_fee_amount: profile.platform_fee_amount,
        certificate_unit_price: profile.certificate_unit_price,
        gst_rate: profile.gst_rate,
        currency: profile.currency,
        razorpay_customer_id: profile.razorpay_customer_id,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      current_usage: {
        certificate_count: currentCertificateCount,
        platform_fee: platformFee,
        usage_cost: Math.round(usageCost * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        gst_amount: Math.round(gstAmount * 100) / 100,
        estimated_total: Math.round(estimatedTotal * 100) / 100,
        currency: profile.currency,
        gst_rate: profile.gst_rate,
      },
      current_period: {
        certificate_count: certificateCount,
        estimated_amount: Math.round(estimatedAmount * 100) / 100,
      },
      recent_invoices: invoices,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
    };
  }
}
