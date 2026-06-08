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
   * Extract text from PDF buffer using pdf2json.
   *
   * Strategy: group text items by rounded Y coordinate into visual lines,
   * sort lines top-to-bottom and items within each line left-to-right,
   * then join with newlines. This preserves the original paragraph structure
   * of the PDF without collapsing everything into a single line per page.
   */
  static async extractText(buffer: Buffer): Promise<PDFExtractionResult> {
    try {
      const pdfParser = new PDFParser();

      const data = await new Promise<Output>((resolve, reject) => {
        pdfParser.on('pdfParser_dataReady', (pdfData) => resolve(pdfData));
        pdfParser.on('pdfParser_dataError', (errMsg) => {
          const errorMessage =
            errMsg instanceof Error
              ? errMsg.message
              : errMsg.parserError?.message;
          reject(new Error(errorMessage || 'PDF parsing failed'));
        });
        pdfParser.parseBuffer(buffer);
      });

      const pages: string[] = [];

      if (data.Pages && data.Pages.length > 0) {
        for (let pageIndex = 0; pageIndex < data.Pages.length; pageIndex++) {
          const page = data.Pages[pageIndex];
          if (!page.Texts || page.Texts.length === 0) continue;

          // ─── Step 1: collect all text items with their coordinates ───────
          const textItems: Array<{ text: string; x: number; y: number }> = [];

          for (const textItem of page.Texts) {
            if (!textItem.R || textItem.R.length === 0) continue;

            let raw = '';
            for (const r of textItem.R) {
              if (r.T) {
                try {
                  raw += decodeURIComponent(r.T);
                } catch {
                  raw += r.T;
                }
              }
            }

            if (!raw) continue;

            textItems.push({
              text: raw,
              x: textItem.x ?? 0,
              y: textItem.y ?? 0,
            });
          }

          // ─── Step 2: group items into lines by rounded Y coordinate ──────
          //
          // Round Y to 1 decimal place. This is the key fix:
          // pdf2json Y values for items on the same visual line differ by
          // tiny floating-point amounts (e.g. 5.153 vs 5.158). Rounding to
          // 1 decimal (5.2) groups them correctly without collapsing adjacent
          // lines that differ by ~0.1-0.2 units.
          const lineMap = new Map<number, Array<{ text: string; x: number }>>();

          for (const item of textItems) {
            const roundedY = Math.round(item.y * 10) / 10; // 1 decimal place
            if (!lineMap.has(roundedY)) {
              lineMap.set(roundedY, []);
            }
            lineMap.get(roundedY)!.push({ text: item.text, x: item.x });
          }

          // ─── Step 3: sort lines top→bottom, items within line left→right ─
          const sortedYKeys = Array.from(lineMap.keys()).sort((a, b) => a - b);

          const lineTexts = sortedYKeys.map((y) => {
            const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
            // Join items on the same line; they are already decoded fragments
            // so we need a space only when the previous fragment doesn't end
            // with a space and the next doesn't start with one.
            return items.reduce((acc, item, i) => {
              if (i === 0) return item.text;
              const needsSpace =
                acc.length > 0 &&
                !acc.endsWith(' ') &&
                !item.text.startsWith(' ');
              return acc + (needsSpace ? ' ' : '') + item.text;
            }, '');
          });

          // ─── Step 4: build page text ──────────────────────────────────────
          let pageText = lineTexts
            .filter((l) => l.trim().length > 0)
            .join('\n');

          // Collapse 3+ consecutive blank lines to 2
          pageText = pageText.replace(/\n{3,}/g, '\n\n').trim();

          if (pageText) {
            pages.push(`=== PAGE ${pageIndex + 1} ===\n${pageText}`);
          }
        }
      }

      const fullText = pages.join('\n\n');

      return {
        text: fullText.trim(),
        pages: data.Pages?.length ?? 0,
        metadata: data.Meta ? this.parseMetadata(data.Meta) : undefined,
      };
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw new Error(
        `Failed to extract text from PDF: ${(error as Error).message}`
      );
    }
  }

  /**
   * Parse PDF metadata
   */
  private static parseMetadata(
    meta: { [key: string]: unknown }
  ): PDFExtractionResult['metadata'] {
    return {
      title: meta.Title as string | undefined,
      author: meta.Author as string | undefined,
      subject: meta.Subject as string | undefined,
      creator: meta.Creator as string | undefined,
      producer: meta.Producer as string | undefined,
      creationDate: meta.CreationDate
        ? new Date(meta.CreationDate as string)
        : undefined,
      modificationDate: meta.ModDate
        ? new Date(meta.ModDate as string)
        : undefined,
    };
  }

  /**
   * Validate if buffer is a valid PDF
   */
  static isValidPDF(buffer: Buffer): boolean {
    if (buffer.length < 5) return false;
    const header = buffer.toString('ascii', 0, 5);
    return header === '%PDF-';
  }
}
