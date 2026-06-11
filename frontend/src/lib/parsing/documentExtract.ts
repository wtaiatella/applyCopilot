import PDFParser, { Output } from "pdf2json";
import mammoth from "mammoth";
import { logger } from "../logging/logger";
import fs from "fs";
import path from "path";

// Helper to resolve the project repository root directory dynamically
const getRepoRoot = (): string => {
  const cwd = process.cwd();
  if (cwd.endsWith("frontend")) {
    return path.join(cwd, "..");
  }
  return cwd;
};

/**
 * Hook to save raw uploaded files to debug/uploads/ in development mode when LOG_LEVEL=debug
 */
export function saveRawUploadForDebug(buffer: Buffer, originalFilename: string) {
  try {
    const isDev = process.env.NODE_ENV !== "production";
    const isDebug = process.env.LOG_LEVEL?.toLowerCase() === "debug";

    if (isDev || isDebug) {
      const repoRoot = getRepoRoot();
      const debugUploadsDir = path.join(repoRoot, "debug", "uploads");

      if (!fs.existsSync(debugUploadsDir)) {
        fs.mkdirSync(debugUploadsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = path.join(debugUploadsDir, `${timestamp}-${safeFilename}`);

      fs.writeFileSync(filePath, buffer);
      logger.info(`Saved raw uploaded file for debugging: ${filePath}`);
    }
  } catch (error) {
    logger.error("Failed to save raw upload for debug", { error });
  }
}

export class DocumentExtractor {
  /**
   * Extract text from PDF buffer
   */
  static async extractPDF(buffer: Buffer): Promise<string> {
    const pdfParser = new PDFParser();

    const data = await new Promise<Output>((resolve, reject) => {
      pdfParser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));
      pdfParser.on("pdfParser_dataError", (errMsg) => {
        const errorMessage =
          errMsg instanceof Error
            ? errMsg.message
            : errMsg?.parserError?.message || JSON.stringify(errMsg);
        reject(new Error(errorMessage || "PDF parsing failed"));
      });
      pdfParser.parseBuffer(buffer);
    });

    const pages: string[] = [];

    if (data.Pages && data.Pages.length > 0) {
      for (let pageIndex = 0; pageIndex < data.Pages.length; pageIndex++) {
        const page = data.Pages[pageIndex];
        if (!page.Texts || page.Texts.length === 0) continue;

        // Group text items by rounded Y coordinate into visual lines
        const textItems: Array<{ text: string; x: number; y: number }> = [];

        for (const textItem of page.Texts) {
          if (!textItem.R || textItem.R.length === 0) continue;

          let raw = "";
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

        // Group items into lines (round Y to 1 decimal place)
        const lineMap = new Map<number, Array<{ text: string; x: number }>>();

        for (const item of textItems) {
          const roundedY = Math.round(item.y * 10) / 10;
          if (!lineMap.has(roundedY)) {
            lineMap.set(roundedY, []);
          }
          lineMap.get(roundedY)!.push({ text: item.text, x: item.x });
        }

        const sortedYKeys = Array.from(lineMap.keys()).sort((a, b) => a - b);

        const lineTexts = sortedYKeys.map((y) => {
          const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
          return items.reduce((acc, item, i) => {
            if (i === 0) return item.text;
            const needsSpace =
              acc.length > 0 &&
              !acc.endsWith(" ") &&
              !item.text.startsWith(" ");
            return acc + (needsSpace ? " " : "") + item.text;
          }, "");
        });

        let pageText = lineTexts
          .filter((l) => l.trim().length > 0)
          .join("\n");

        pageText = pageText.replace(/\n{3,}/g, "\n\n").trim();

        if (pageText) {
          pages.push(`=== PAGE ${pageIndex + 1} ===\n${pageText}`);
        }
      }
    }

    return pages.join("\n\n").trim();
  }

  /**
   * Extract text from DOCX buffer
   */
  static async extractDOCX(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.length > 0) {
      logger.warn("DOCX extraction warnings", { warnings: result.messages });
    }
    return result.value.trim();
  }

  /**
   * Main text extraction router
   */
  static async extractText(buffer: Buffer, filename: string): Promise<string> {
    const ext = path.extname(filename).toLowerCase();
    
    // Save raw upload for debug before processing
    saveRawUploadForDebug(buffer, filename);

    if (ext === ".pdf") {
      logger.info(`Extracting text from PDF: ${filename}`);
      return this.extractPDF(buffer);
    } else if (ext === ".docx") {
      logger.info(`Extracting text from DOCX: ${filename}`);
      return this.extractDOCX(buffer);
    } else {
      throw new Error(`Unsupported file type: ${ext}. Only PDF and DOCX files are allowed.`);
    }
  }
}
