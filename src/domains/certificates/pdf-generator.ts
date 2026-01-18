/**
 * PDF/IMAGE GENERATOR
 *
 * Service for generating certificate PDFs or images from templates.
 * - PDF templates → output as PDF with overlaid text
 * - Image templates → output as image (same format) with overlaid text
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import sharp from 'sharp';
import type { FieldMapping } from './types.js';

/**
 * Internal field type for certificate generation
 * This includes all style properties that may come from the database style JSON
 */
export interface GeneratorField {
  id: string;
  field_key?: string;
  label?: string;
  type: string;
  page_number?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: string;
  prefix?: string;
  suffix?: string;
  dateFormat?: string;
  style?: Record<string, unknown>;
  required?: boolean;
}

interface GeneratePDFOptions {
  templateUrl: string;
  templateType: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'image';
  templateWidth?: number;
  templateHeight?: number;
  fields: GeneratorField[];
  fieldMappings: FieldMapping[];
  rowData: Record<string, unknown>;
  includeQR: boolean;
  verificationToken?: string;
  appUrl: string;
}

interface GenerateImageOptions {
  templateUrl: string;
  templateMimeType: string;
  fields: GeneratorField[];
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

  // Log field mapping details for debugging
  console.log('[PDFGenerator] Starting certificate generation with:', {
    template_type: templateType,
    fields_count: fields.length,
    field_mappings_count: fieldMappings.length,
    row_data_keys: Object.keys(rowData),
    fields_info: fields.map(f => ({ id: f.id, field_key: f.field_key, type: f.type, label: f.label })),
    field_mappings_info: fieldMappings.map(m => ({ fieldId: m.fieldId, columnName: m.columnName })),
  });

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

  console.log('[PDFGenerator] Processing fields:', {
    fieldCount: fields.length,
    mappingCount: fieldMappings.length,
    fields: fields.map(f => ({ id: f.id, label: f.label, type: f.type })),
    mappings: fieldMappings,
    rowDataKeys: Object.keys(rowData),
  });

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
      // Try multiple matching strategies for field mapping
      const originalFieldId = field.style?.originalFieldId as string | undefined;

      let mapping = fieldMappings.find((m) => m.fieldId === field.id);
      if (!mapping && originalFieldId) {
        // Try matching with originalFieldId stored in style
        mapping = fieldMappings.find((m) => m.fieldId === originalFieldId);
      }
      if (!mapping && field.field_key) {
        // Fallback: try matching fieldId to field_key (handles client-generated UUIDs)
        mapping = fieldMappings.find((m) => m.fieldId === field.field_key);
      }
      if (!mapping && field.field_key) {
        // Fallback 2: try matching with sanitized fieldId to field_key
        mapping = fieldMappings.find((m) => {
          const sanitizedFieldId = m.fieldId.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
          return sanitizedFieldId === field.field_key;
        });
      }
      if (!mapping) {
        console.log(`[PDFGenerator] No mapping found for field: ${field.id} (${field.label}, field_key: ${field.field_key}, originalFieldId: ${originalFieldId})`);
        continue;
      }

      let value = String(rowData[mapping.columnName] ?? '');
      console.log(`[PDFGenerator] Field ${field.label}: mapping=${mapping.columnName}, value="${value}"`);

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
 * Generate a single certificate as an image (PNG, JPEG, or WebP)
 * Used when the template is an image format
 */
export async function generateCertificateImage(
  options: GenerateImageOptions
): Promise<Uint8Array> {
  const {
    templateUrl,
    templateMimeType,
    fields,
    fieldMappings,
    rowData,
    includeQR,
    verificationToken,
    appUrl,
  } = options;

  // Fetch template image
  const templateResponse = await fetch(templateUrl);
  const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());

  // Get image metadata
  const metadata = await sharp(templateBuffer).metadata();
  const imageWidth = metadata.width || 800;
  const imageHeight = metadata.height || 600;

  console.log('[ImageGenerator] Processing fields:', {
    fieldCount: fields.length,
    mappingCount: fieldMappings.length,
    fields: fields.map(f => ({ id: f.id, label: f.label, type: f.type })),
    mappings: fieldMappings,
    rowDataKeys: Object.keys(rowData),
  });

  // Build SVG overlay for text and QR code
  const svgElements: string[] = [];

  // Add text fields
  for (const field of fields) {
    if (field.type === 'qr_code') {
      continue; // Handle QR separately
    }

    // Get value from row data
    // Try multiple matching strategies for field mapping
    const originalFieldId = field.style?.originalFieldId as string | undefined;

    let mapping = fieldMappings.find((m) => m.fieldId === field.id);
    if (!mapping && originalFieldId) {
      // Try matching with originalFieldId stored in style
      mapping = fieldMappings.find((m) => m.fieldId === originalFieldId);
    }
    if (!mapping && field.field_key) {
      // Fallback: try matching fieldId to field_key (handles client-generated UUIDs)
      mapping = fieldMappings.find((m) => m.fieldId === field.field_key);
    }
    if (!mapping && field.field_key) {
      // Fallback 2: try matching with sanitized fieldId to field_key
      mapping = fieldMappings.find((m) => {
        const sanitizedFieldId = m.fieldId.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return sanitizedFieldId === field.field_key;
      });
    }
    if (!mapping) {
      console.log(`[ImageGenerator] No mapping found for field: ${field.id} (${field.label}, field_key: ${field.field_key}, originalFieldId: ${originalFieldId})`);
      continue;
    }

    let value = String(rowData[mapping.columnName] ?? '');
    console.log(`[ImageGenerator] Field ${field.label}: mapping=${mapping.columnName}, value="${value}"`);

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

    // Calculate text position
    const textX = field.x;
    const textY = field.y + field.height / 2;

    // Text alignment
    let textAnchor = 'start';
    let adjustedX = textX;
    if (field.textAlign === 'center') {
      textAnchor = 'middle';
      adjustedX = textX + field.width / 2;
    } else if (field.textAlign === 'right') {
      textAnchor = 'end';
      adjustedX = textX + field.width;
    }

    // Font style
    const fontWeight = field.fontWeight === 'bold' ? 'bold' : 'normal';
    const fontStyle = field.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontFamily = field.fontFamily || 'Arial, Helvetica, sans-serif';
    const fontSize = field.fontSize || 16;
    const color = field.color || '#000000';

    // Escape special characters for SVG
    const escapedValue = finalValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    svgElements.push(
      `<text x="${adjustedX}" y="${textY}" ` +
      `font-family="${fontFamily}" font-size="${fontSize}px" ` +
      `font-weight="${fontWeight}" font-style="${fontStyle}" ` +
      `fill="${color}" text-anchor="${textAnchor}" ` +
      `dominant-baseline="middle">${escapedValue}</text>`
    );
  }

  // Add QR code if requested
  if (includeQR && verificationToken) {
    const qrField = fields.find((f) => f.type === 'qr_code');
    if (qrField) {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(`${appUrl}/verify/${verificationToken}`, {
        width: qrField.width,
        margin: 1,
      });

      // Extract base64 data from data URL
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');

      svgElements.push(
        `<image x="${qrField.x}" y="${qrField.y}" ` +
        `width="${qrField.width}" height="${qrField.height}" ` +
        `href="data:image/png;base64,${base64Data}"/>`
      );
    }
  }

  // Create SVG overlay
  const svgOverlay = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${svgElements.join('\n    ')}
  </svg>`;

  // Composite the SVG overlay onto the template image
  let outputImage = sharp(templateBuffer)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ]);

  // Output in the same format as the template
  let outputBuffer: Buffer;
  if (templateMimeType === 'image/png') {
    outputBuffer = await outputImage.png().toBuffer();
  } else if (templateMimeType === 'image/webp') {
    outputBuffer = await outputImage.webp({ quality: 90 }).toBuffer();
  } else {
    // Default to JPEG for image/jpeg
    outputBuffer = await outputImage.jpeg({ quality: 90 }).toBuffer();
  }

  return new Uint8Array(outputBuffer);
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
