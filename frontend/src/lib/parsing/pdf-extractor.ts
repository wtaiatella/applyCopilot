// PDF Text Extraction Service
// Uses pdf2json library to extract text from PDF files
// pdf2json is specifically designed for Node.js server-side use

import PDFParser, { Output } from 'pdf2json';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

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
   * Helper to extract text from PDF buffer using the python3 parse_cv.py script
   */
  private static async extractTextWithPython(buffer: Buffer): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `cv-temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.pdf`);
    
    try {
      // Write buffer to temp file
      await fs.writeFile(tempFilePath, buffer);
      
      // Locate the parse_cv.py script.
      const scriptPath = path.join(process.cwd(), '..', 'myJobs', 'scripts', 'parse_cv.py');
      
      // Run the python3 process
      const { stdout } = await execFileAsync('python3', [scriptPath, tempFilePath], { maxBuffer: 10 * 1024 * 1024 });
      
      return stdout;
    } catch (error) {
      console.warn('Python CV extraction failed:', error);
      throw error;
    } finally {
      // Clean up the temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Extract text from PDF buffer
   */
  static async extractText(buffer: Buffer): Promise<PDFExtractionResult> {
    // 1. Try python first (handles Type 3 fonts and encoding issues much better via pypdf)
    try {
      const pythonText = await this.extractTextWithPython(buffer);
      if (pythonText && pythonText.trim().replace(/[G\s]+/g, '').length > 10) {
        // Run pdf2json in parallel just to extract pages count and metadata if possible
        let pagesCount = 0;
        let metadata = undefined;
        try {
          const pdfParser = new PDFParser();
          const data = await new Promise<Output>((resolve, reject) => {
            pdfParser.on('pdfParser_dataReady', (pdfData) => resolve(pdfData));
            pdfParser.on('pdfParser_dataError', (err) => reject(err));
            pdfParser.parseBuffer(buffer);
          });
          pagesCount = data.Pages?.length || 0;
          metadata = data.Meta ? this.parseMetadata(data.Meta) : undefined;
        } catch (e) {
          // ignore structural errors for page count/metadata fallback
        }

        return {
          text: pythonText.trim(),
          pages: pagesCount || 1,
          metadata,
        };
      }
    } catch (pythonError) {
      console.warn('Python CV extraction failed, falling back to node-based parser:', pythonError);
    }

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

          // Group text items by Y position (lines) with a small vertical tolerance
          const textItems = page.Texts.filter(t => t.R && t.R.length > 0);
          
          // Group items into lines using a small vertical tolerance
          const lineGroups: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
          const TOLERANCE = 0.2; // vertical tolerance in pdf2json units

          for (const textItem of textItems) {
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

            if (!lineText) continue;

            const y = textItem.y || 0;
            const x = textItem.x || 0;

            let added = false;
            for (const group of lineGroups) {
              if (Math.abs(group.y - y) <= TOLERANCE) {
                group.items.push({ text: lineText, x });
                added = true;
                break;
              }
            }

            if (!added) {
              lineGroups.push({
                y,
                items: [{ text: lineText, x }]
              });
            }
          }

          // Sort lines by Y position (top to bottom) and text within lines by X position (left to right)
          const sortedLines = lineGroups
            .sort((a, b) => a.y - b.y)
            .map(group => {
              group.items.sort((a, b) => a.x - b.x);
              return group.items.map(item => item.text).join(' ');
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
