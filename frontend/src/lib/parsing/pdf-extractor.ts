// PDF Text Extraction Service
// Uses pdf2json library to extract text from PDF files
// pdf2json is specifically designed for Node.js server-side use

import PDFParser, { Output } from 'pdf2json';

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
      const pdfParser = new PDFParser();

      const data = await new Promise<Output>((resolve, reject) => {
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
          resolve(pdfData);
        });

        pdfParser.on('pdfParser_dataError', (errMsg) => {
          const errorMessage = errMsg instanceof Error ? errMsg.message : errMsg.parserError?.message;
          reject(new Error(errorMessage || 'PDF parsing failed'));
        });

        pdfParser.parseBuffer(buffer);
      });

      // Extract text with structure preservation
      const pages: string[] = [];
      if (data.Pages && data.Pages.length > 0) {
        for (let pageIndex = 0; pageIndex < data.Pages.length; pageIndex++) {
          const page = data.Pages[pageIndex];
          if (!page.Texts || page.Texts.length === 0) continue;

          // Group text items by Y position (lines)
          const lines = new Map<number, Array<{ text: string; x: number }>>();
          
          for (const textItem of page.Texts) {
            if (!textItem.R || textItem.R.length === 0) continue;
            
            // Get Y position (rounded to nearest integer for grouping)
            const y = Math.round(textItem.y || 0);
            
            if (!lines.has(y)) {
              lines.set(y, []);
            }
            
            // Combine text runs at this position
            let lineText = '';
            for (const r of textItem.R) {
              if (r.T) {
                try {
                  lineText += decodeURIComponent(r.T);
                } catch (e) {
                  lineText += r.T;
                }
              }
            }
            
            if (lineText) {
              lines.get(y)!.push({ text: lineText, x: textItem.x || 0 });
            }
          }

          // Sort lines by Y position (top to bottom) and text within lines by X position (left to right)
          const sortedLines = Array.from(lines.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([_y, items]) => {
              items.sort((a, b) => a.x - b.x);
              return items.map(item => item.text).join(' ');
            });

          // Join lines with proper formatting
          let pageText = sortedLines.join('\n');
          
          // Clean up excessive whitespace within lines but preserve line breaks
          pageText = pageText
            .replace(/[ \t]+/g, ' ')  // Multiple spaces/tabs to single space
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .trim();
          
          if (pageText) {
            pages.push(`=== PAGE ${pageIndex + 1} ===\n${pageText}`);
          }
        }
      }

      const fullText = pages.join('\n\n');

      return {
        text: fullText.trim(),
        pages: data.Pages?.length || 0,
        metadata: data.Meta ? this.parseMetadata(data.Meta) : undefined,
      };
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Parse PDF metadata
   */
  private static parseMetadata(meta: { [key: string]: unknown }): PDFExtractionResult['metadata'] {
    return {
      title: meta.Title as string | undefined,
      author: meta.Author as string | undefined,
      subject: meta.Subject as string | undefined,
      creator: meta.Creator as string | undefined,
      producer: meta.Producer as string | undefined,
      creationDate: meta.CreationDate ? new Date(meta.CreationDate as string) : undefined,
      modificationDate: meta.ModDate ? new Date(meta.ModDate as string) : undefined,
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
