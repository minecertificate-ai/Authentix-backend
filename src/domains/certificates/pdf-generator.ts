/**
 * PDF GENERATOR
 *
 * Service for generating certificate PDFs from templates.
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import type { CertificateField } from '../templates/types.js';
import type { FieldMapping } from './types.js';

interface GeneratePDFOptions {
  templateUrl: string;
  templateType: 'pdf' | 'png' | 'jpg' | 'jpeg';
  templateWidth?: number;
  templateHeight?: number;
  fields: CertificateField[];
  fieldMappings: FieldMapping[];
  rowData: Record<string, unknown>;
  includeQR: boolean;
  verificationToken?: string;
  appUrl: string;
}

/**
 * Generate a single certificate PDF
 */
export async function generateCertificatePDF(
  options: GeneratePDFOptions
): Promise<Uint8Array> {
  const {
    templateUrl,
    templateType,
    templateWidth,
    templateHeight,
    fields,
    fieldMappings,
    rowData,
    includeQR,
    verificationToken,
    appUrl,
  } = options;

  let pdfDoc: PDFDocument;
  let firstPage: PDFPage;
  let pageWidth: number;
  let pageHeight: number;

  // Load template
  if (templateType === 'pdf') {
    const pdfResponse = await fetch(templateUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    firstPage = pages[0]!;
    const size = firstPage.getSize();
    pageWidth = size.width;
    pageHeight = size.height;
  } else {
    // Create PDF from image template
    pdfDoc = await PDFDocument.create();
    const imageResponse = await fetch(templateUrl);
    const imageBuffer = await imageResponse.arrayBuffer();

    let image;
    if (templateType === 'png') {
      image = await pdfDoc.embedPng(imageBuffer);
    } else {
      image = await pdfDoc.embedJpg(imageBuffer);
    }

    pageWidth = templateWidth ?? 800;
    pageHeight = templateHeight ?? 600;

    firstPage = pdfDoc.addPage([pageWidth, pageHeight]);
    firstPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  // Add fields to PDF
  for (const field of fields) {
    if (field.type === 'qr_code') {
      if (includeQR && verificationToken) {
        const qrCodeDataUrl = await QRCode.toDataURL(
          `${appUrl}/verify/${verificationToken}`
        );
        const qrImage = await pdfDoc.embedPng(qrCodeDataUrl);

        firstPage.drawImage(qrImage, {
          x: field.x,
          y: pageHeight - field.y - field.height,
          width: field.width,
          height: field.height,
        });
      }
    } else {
      // Get value from row data
      const mapping = fieldMappings.find((m) => m.fieldId === field.id);
      if (!mapping) continue;

      let value = String(rowData[mapping.columnName] ?? '');

      // Format dates
      if ((field.type === 'start_date' || field.type === 'end_date') && value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            value = format(date, field.dateFormat ?? 'MMMM dd, yyyy');
          }
        } catch {
          // Keep original value if date parsing fails
        }
      }

      // Add prefix/suffix
      const finalValue = `${field.prefix ?? ''}${value}${field.suffix ?? ''}`;

      // Embed font
      const font = await getFont(pdfDoc, field.fontFamily);

      // Calculate text size
      const fontSize = field.fontSize;
      const textWidth = font.widthOfTextAtSize(finalValue, fontSize);

      // Calculate X position based on alignment
      let textX = field.x;
      if (field.textAlign === 'center') {
        textX = field.x + (field.width - textWidth) / 2;
      } else if (field.textAlign === 'right') {
        textX = field.x + field.width - textWidth;
      }

      // Convert color hex to RGB
      const color = hexToRgb(field.color);

      // Draw text
      firstPage.drawText(finalValue, {
        x: textX,
        y: pageHeight - field.y - field.height / 2 - fontSize / 3,
        size: fontSize,
        font: font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
      });
    }
  }

  // Save PDF
  return await pdfDoc.save();
}

/**
 * Get font for PDF
 */
async function getFont(
  pdfDoc: PDFDocument,
  fontFamily: string
): Promise<ReturnType<typeof PDFDocument.prototype.embedFont>> {
  const fontMap: Record<string, keyof typeof StandardFonts> = {
    Arial: 'Helvetica',
    Helvetica: 'Helvetica',
    'Times New Roman': 'TimesRoman',
    Times: 'TimesRoman',
    Courier: 'Courier',
    'Courier New': 'Courier',
  };

  const fontKey = fontMap[fontFamily] ?? 'Helvetica';
  const standardFont = StandardFonts[fontKey];
  return await pdfDoc.embedFont(standardFont);
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1]!, 16),
        g: parseInt(result[2]!, 16),
        b: parseInt(result[3]!, 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Generate verification token
 */
export function generateVerificationToken(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
    .substring(0, 100);
}
