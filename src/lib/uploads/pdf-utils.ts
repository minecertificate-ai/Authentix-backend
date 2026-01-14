/**
 * PDF UTILITIES
 *
 * Utilities for working with PDF files.
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Get page count from PDF buffer
 * Returns 1 if unable to determine (fallback)
 */
export async function getPDFPageCount(buffer: Buffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    // If PDF parsing fails, return default of 1
    console.warn('[getPDFPageCount] Failed to parse PDF, using default page count of 1:', error);
    return 1;
  }
}
