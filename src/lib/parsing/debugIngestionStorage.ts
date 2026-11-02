import fs from "fs/promises";
import path from "path";
import { logger } from "../logging/logger";

/**
 * Resolves repository root directory dynamically.
 */
export const getRepoRoot = (): string => {
  if (process.env.REPO_ROOT) {
    return process.env.REPO_ROOT;
  }
  const cwd = process.cwd();
  if (cwd.endsWith("frontend")) {
    return path.join(cwd, "..");
  }
  return cwd;
};

/**
 * Sanitizes a filename to protect against path traversal and special characters.
 * Replaces non-alphanumeric (except dot, dash) with underscore, capped at 80 characters.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "upload";
  const normalized = filename.replace(/\\/g, "/");
  const base = path.basename(normalized);
  const safe = base.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  if (!safe || safe === "." || safe === "..") return "upload";
  return safe;
}

/**
 * Encapsulates per-run isolated debug audit storage for CV ingestion.
 * Gated by LOG_LEVEL=debug. All filesystem operations are fail-safe and non-blocking.
 */
export class IngestionDebugSession {
  readonly isDebug: boolean;
  readonly runDir: string | null = null;
  private initialized = false;

  constructor(filename: string) {
    this.isDebug = (process.env.LOG_LEVEL || "").toLowerCase() === "debug";
    if (this.isDebug) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeFilename = sanitizeFilename(filename);
      const repoRoot = getRepoRoot();
      this.runDir = path.join(
        repoRoot,
        "debug",
        "ingestion",
        `${timestamp}-${safeFilename}`,
      );
    }
  }

  static createSession(filename: string): IngestionDebugSession {
    return new IngestionDebugSession(filename);
  }

  private async ensureDir(): Promise<boolean> {
    if (!this.isDebug || !this.runDir) return false;
    if (!this.initialized) {
      try {
        await fs.mkdir(this.runDir, { recursive: true });
        this.initialized = true;
        logger.info(
          `[IngestionDebugStorage] Initialized run directory: ${this.runDir}`,
        );
      } catch (error) {
        logger.warn(
          "[IngestionDebugStorage] Failed to create debug directory",
          { error },
        );
        return false;
      }
    }
    return true;
  }

  async saveOriginal(filename: string, buffer: Buffer): Promise<void> {
    if (!(await this.ensureDir()) || !this.runDir) return;
    try {
      const safeFilename = sanitizeFilename(filename);
      await fs.writeFile(path.join(this.runDir, safeFilename), buffer);
    } catch (error) {
      logger.warn("[IngestionDebugStorage] Failed to save original upload", {
        error,
      });
    }
  }

  async saveTranscription(text: string): Promise<void> {
    if (!(await this.ensureDir()) || !this.runDir) return;
    try {
      await fs.writeFile(
        path.join(this.runDir, "transcription.txt"),
        text,
        "utf-8",
      );
    } catch (error) {
      logger.warn("[IngestionDebugStorage] Failed to save transcription", {
        error,
      });
    }
  }

  async saveStagePayload(stageName: string, data: unknown): Promise<void> {
    if (!(await this.ensureDir()) || !this.runDir) return;
    try {
      const filePath = path.join(this.runDir, `${stageName}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      logger.warn(
        `[IngestionDebugStorage] Failed to save stage payload: ${stageName}`,
        { error },
      );
    }
  }
}
