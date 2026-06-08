// DOCX Text Extraction Service
// Uses mammoth library to extract text from DOCX files

import mammoth from 'mammoth';

export interface DOCXExtractionResult {
  text: string;
  metadata?: {
    paragraphs?: number;
    images?: number;
  };
}

export class DOCXExtractor {
  /**
   * Extract raw text from DOCX buffer
   */
  static async extractText(buffer: Buffer): Promise<DOCXExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });

      if (result.messages.length > 0) {
        console.warn('DOCX extraction warnings:', result.messages);
      }

      return {
        text: result.value,
        metadata: {
          paragraphs: result.value.split('\n').filter(p => p.trim()).length,
        },
      };
    } catch (error) {
      console.error('DOCX extraction failed:', error);
      throw new Error(`Failed to extract text from DOCX: ${(error as Error).message}`);
    }
  }

  /**
   * Extract text with basic formatting (HTML)
   */
  static async extractHTML(buffer: Buffer): Promise<{ html: string; messages: string[] }> {
    try {
      const result = await mammoth.convertToHtml({ buffer });

      if (result.messages.length > 0) {
        console.warn('DOCX HTML conversion warnings:', result.messages);
      }

      return {
        html: result.value,
        messages: result.messages.map(m => m.message),
      };
    } catch (error) {
      console.error('DOCX HTML extraction failed:', error);
      throw new Error(`Failed to extract HTML from DOCX: ${(error as Error).message}`);
    }
  }

  /**
   * Validate if buffer is a valid DOCX
   */
  static isValidDOCX(buffer: Buffer): boolean {
    // DOCX files are ZIP files starting with PK
    if (buffer.length < 4) return false;
    const header = buffer.toString('ascii', 0, 2);
    return header === 'PK';
  }
}
