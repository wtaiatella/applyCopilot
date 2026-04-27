// PDF Text Extraction Service
// Uses pdf-parse library to extract text from PDF files

import pdfParse from 'pdf-parse';

export interface PDFExtractionResult {
  text: string;
  pages?: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

export class PDFExtractor {
  /**
   * Extract text from PDF buffer
   */
  static async extractText(buffer: Buffer): Promise<PDFExtractionResult> {
    try {
      const data = await pdfParse(buffer);

      return {
        text: data.text,
        pages: data.numpages,
        metadata: data.info ? this.parseMetadata(data.info) : undefined,
      };
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Parse PDF metadata
   */
  private static parseMetadata(info: Record<string, unknown>): PDFExtractionResult['metadata'] {
    return {
      title: info.Title as string | undefined,
      author: info.Author as string | undefined,
      subject: info.Subject as string | undefined,
      creator: info.Creator as string | undefined,
      producer: info.Producer as string | undefined,
      creationDate: info.CreationDate ? new Date(info.CreationDate as string) : undefined,
      modificationDate: info.ModDate ? new Date(info.ModDate as string) : undefined,
    };
  }

  /**
   * Validate if buffer is a valid PDF
   */
  static isValidPDF(buffer: Buffer): boolean {
    // PDF files start with %PDF-
    if (buffer.length < 5) return false;
    const header = buffer.toString('ascii', 0, 5);
    return header === '%PDF-';
  }
}
