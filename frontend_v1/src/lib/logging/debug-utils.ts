/**
 * Debug artifact utilities for CV parsing pipeline.
 *
 * When LOG_LEVEL=debug, saves intermediate inputs and outputs of each
 * parsing step as flat files in `debug/` with a chronological filename:
 *
 *   YYYY-MM-DD-HH-mm-ss-<requestId>-<description>.<ext>
 *
 * Example:
 *   debug/2026-06-04-17-30-00-ab3f7c-01_extractedCV.txt
 *   debug/2026-06-04-17-30-01-ab3f7c-02_segments.json
 *   debug/2026-06-04-17-30-15-ab3f7c-03_output_basic.json
 *   ...
 *
 * This keeps everything in a single folder, flat, and naturally sorted
 * by date — no subfolders, no clutter.
 */

import fs from 'fs/promises';
import path from 'path';
import { loggers } from './logger';

const isDebugMode = (): boolean => {
  const logLevel = process.env.LOG_LEVEL;
  return (
    process.env.NODE_ENV !== 'production' &&
    (logLevel === 'debug' || logLevel === 'verbose' || logLevel === 'silly')
  );
};

const DEBUG_DIR = path.join(process.cwd(), 'debug');

/** Returns a timestamp prefix like `2026-06-04-17-30-00` */
const timestampPrefix = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
};

/**
 * Save a debug artifact as a flat file inside `debug/`.
 *
 * @param requestId  - Short ID of the upload/parse session (e.g. "ab3f7c")
 * @param description - Descriptive filename suffix (e.g. "01_extractedCV.txt")
 * @param content    - String content or any object (will be JSON.stringify'd)
 */
export async function saveDebugArtifact(
  requestId: string,
  description: string,
  content: string | object
): Promise<void> {
  if (!isDebugMode()) return;

  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });

    const filename = `${timestampPrefix()}-${requestId}-${description}`;
    const filePath = path.join(DEBUG_DIR, filename);
    const data =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    await fs.writeFile(filePath, data, 'utf-8');
    loggers.app.debug(`[${requestId}] Debug artifact saved → ${filename}`);
  } catch (error) {
    // Never crash the main flow because of debug logging
    loggers.app.warn(
      `[${requestId}] Failed to save debug artifact "${description}"`,
      { error: (error as Error).message }
    );
  }
}
