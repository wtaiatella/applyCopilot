import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export const DEFAULT_RETENTION_DAYS = 15;
export const RETENTION_CONFIG_KEY = "SCRAPER_JOB_RETENTION_DAYS";

export interface CleanupResult {
  purgedCount: number;
  retentionDays: number;
  cutoffDate: Date;
  durationMs: number;
}

/**
 * Reads retention days from SystemConfig or falls back to DEFAULT_RETENTION_DAYS.
 */
export async function getRetentionDays(): Promise<number> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: RETENTION_CONFIG_KEY },
    });
    const parsed = parseInt(config?.value ?? "");
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_RETENTION_DAYS : parsed;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

/**
 * Purges expired orphan job listings from the database.
 * 
 * Strict Protection Rule (RF-3 / APC-24):
 * A job is NEVER deleted if:
 * - Favorited (favorites.length > 0)
 * - Match analysis performed (analyses.length > 0)
 * - Tracked in Application Tracker (applications.length > 0)
 * - Associated with a CV (cvs.length > 0)
 * 
 * Only strictly orphan jobs older than cutoffDate are hard deleted.
 */
export async function purgeExpiredOrphanJobs(daysOverride?: number): Promise<CleanupResult> {
  const startTime = Date.now();
  const retentionDays = daysOverride !== undefined && daysOverride > 0
    ? daysOverride
    : await getRetentionDays();

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  logger.info("[JobCleanup] Starting orphan job retention sweep...", {
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
  });

  try {
    const result = await prisma.jobListing.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        favorites: { none: {} },
        analyses: { none: {} },
        applications: { none: {} },
        cvs: { none: {} },
      },
    });

    const durationMs = Date.now() - startTime;
    logger.info("[JobCleanup] Successfully purged orphan jobs", {
      purgedCount: result.count,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      durationMs,
    });

    return {
      purgedCount: result.count,
      retentionDays,
      cutoffDate,
      durationMs,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[JobCleanup] Failed to execute orphan job retention sweep", {
      error: errMsg,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    });
    throw error;
  }
}
