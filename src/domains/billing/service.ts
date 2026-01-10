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
    // Get current period (previous month)
    const period = getPreviousMonthBillingPeriod();
    const startDate = period.start.toISOString();
    const endDate = period.end.toISOString();

    // Get billing profile
    const profile = await this.repository.getBillingProfile(companyId);
    if (!profile) {
      throw new NotFoundError('Billing profile not found');
    }

    // Get unbilled certificate count
    const certificateCount = await this.repository.getUnbilledCertificateCount(
      companyId,
      startDate,
      endDate
    );

    // Calculate estimated amount
    const platformFee = profile.platform_fee_amount;
    const certificateAmount = certificateCount * profile.certificate_unit_price;
    const subtotal = platformFee + certificateAmount;
    const taxAmount = subtotal * (profile.gst_rate / 100);
    const estimatedAmount = subtotal + taxAmount;

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
      current_period: {
        certificate_count: certificateCount,
        estimated_amount: Math.round(estimatedAmount * 100) / 100,
      },
      recent_invoices: invoices,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
    };
  }
}
