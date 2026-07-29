import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";
import { isProviderBlocked, withCircuitBreaker } from "../ai/circuit-breaker";
import { classifyJobListing } from "../../services/jobClassificationService";
import { generateEmbedding } from "../ai/vector-service";

/** The SystemConfig key for the Parsing Provider capability */
const PARSING_PROVIDER_KEY = "AI_PROVIDER_PARSING";

/** Guard to prevent multiple bootstrap calls */
let isClassifierRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// SystemConfig helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a numeric value from SystemConfig. Falls back to `defaultVal` if the key
 * is missing, empty, or not a valid integer.
 */
async function getConfigInt(key: string, defaultVal: number): Promise<number> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    const parsed = parseInt(row?.value ?? "");
    return isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
  } catch {
    return defaultVal;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker config defaults (all overridable via SystemConfig)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration keys and their defaults:
 *
 * | Key                             | Default | Meaning                                          |
 * |----------------------------------|---------|--------------------------------------------------|
 * | CLASSIFIER_INTERVAL_MINUTES      | 5       | How often the worker wakes up (in minutes)       |
 * | CLASSIFIER_BATCH_SIZE            | 20      | Max jobs fetched from DB per run                 |
 * | CLASSIFIER_MAX_ATTEMPTS          | 3       | Max LLM attempts per job before marking FAILED   |
 * | CLASSIFIER_COOLDOWN_MINUTES      | 60      | How long a BLOCKED provider stays blocked        |
 */
const CONFIG_KEYS = {
  INTERVAL_MINUTES: "CLASSIFIER_INTERVAL_MINUTES",
  BATCH_SIZE: "CLASSIFIER_BATCH_SIZE",
  MAX_ATTEMPTS: "CLASSIFIER_MAX_ATTEMPTS",
  COOLDOWN_MINUTES: "CLASSIFIER_COOLDOWN_MINUTES",
} as const;

const DEFAULTS = {
  INTERVAL_MINUTES: 5,
  BATCH_SIZE: 20,
  MAX_ATTEMPTS: 3,
  COOLDOWN_MINUTES: 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Worker run
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerRunResult {
  processed: number;
  failed: number;
  skippedBlocked: boolean;
}

/**
 * Background classification worker — single run.
 *
 * On each invocation:
 * 1. Reads runtime config from SystemConfig (batch size, max attempts, cooldown).
 * 2. Checks if the Parsing Provider LLM is currently BLOCKED by the circuit breaker.
 *    If blocked, logs and returns immediately.
 * 3. Fetches up to CLASSIFIER_BATCH_SIZE job listings where:
 *    - `isFullDescriptionFetched = true`
 *    - `classificationStatus = PENDING`
 *    - `classificationAttempts < CLASSIFIER_MAX_ATTEMPTS`
 * 4. For each listing, sequentially:
 *    a. Sets `classificationStatus = RUNNING`.
 *    b. Calls `jobClassificationService` (with circuit breaker) to get the cleaned summary.
 *    c. Generates the 512-dimension local vector via `vector-service`.
 *    d. Saves `cleanedSummary`, `embedding`, `classificationStatus = COMPLETED`.
 * 5. On transient errors: increments `classificationAttempts`, resets to `PENDING`.
 *    Once attempts >= CLASSIFIER_MAX_ATTEMPTS, marks as `FAILED`.
 * 6. On circuit-breaking errors (429/401/402): circuit breaker blocks the provider
 *    for CLASSIFIER_COOLDOWN_MINUTES and the job stays PENDING.
 */
export async function runClassificationWorker(): Promise<WorkerRunResult> {
  logger.info("[ClassificationWorker] Starting classification worker run...");

  // Step 1: Load runtime config from SystemConfig
  const [batchSize, maxAttempts, cooldownMinutes] = await Promise.all([
    getConfigInt(CONFIG_KEYS.BATCH_SIZE, DEFAULTS.BATCH_SIZE),
    getConfigInt(CONFIG_KEYS.MAX_ATTEMPTS, DEFAULTS.MAX_ATTEMPTS),
    getConfigInt(CONFIG_KEYS.COOLDOWN_MINUTES, DEFAULTS.COOLDOWN_MINUTES),
  ]);

  const cooldownMs = cooldownMinutes * 60 * 1000;

  logger.info(
    `[ClassificationWorker] Config: batchSize=${batchSize}, maxAttempts=${maxAttempts}, cooldown=${cooldownMinutes}min`
  );

  // Step 2: Check if the provider is blocked
  const blocked = await isProviderBlocked(PARSING_PROVIDER_KEY);

  if (blocked) {
    logger.warn(
      `[ClassificationWorker] Parsing provider (${PARSING_PROVIDER_KEY}) is BLOCKED. Skipping this run.`
    );
    return { processed: 0, failed: 0, skippedBlocked: true };
  }

  // Step 3: Fetch pending jobs
  const pendingJobs = await prisma.jobListing.findMany({
    where: {
      isFullDescriptionFetched: true,
      classificationStatus: "PENDING",
      classificationAttempts: { lt: maxAttempts },
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      company: true,
      fullDescription: true,
      classificationAttempts: true,
    },
  });

  if (pendingJobs.length === 0) {
    logger.info("[ClassificationWorker] No pending jobs to classify. Worker run complete.");
    return { processed: 0, failed: 0, skippedBlocked: false };
  }

  logger.info(`[ClassificationWorker] Found ${pendingJobs.length} pending job(s) to classify.`);

  let processed = 0;
  let failed = 0;

  // Step 4: Process each job sequentially
  for (const job of pendingJobs) {
    if (!job.fullDescription) {
      logger.warn(`[ClassificationWorker] Job ${job.id} has no fullDescription. Skipping.`);
      continue;
    }

    // Mark as RUNNING
    await prisma.jobListing.update({
      where: { id: job.id },
      data: { classificationStatus: "RUNNING" },
    });

    try {
      // LLM cleaning — circuit breaker uses the configured cooldown
      const { cleanedSummary } = await withCircuitBreaker(
        PARSING_PROVIDER_KEY,
        () =>
          classifyJobListing({
            id: job.id,
            title: job.title,
            company: job.company,
            fullDescription: job.fullDescription!,
          }),
        cooldownMs
      );

      // Generate 512-dimension local vector
      const embeddingVector = await generateEmbedding(cleanedSummary);

      // Persist via raw SQL (Prisma does not support pgvector in update())
      const vectorString = `[${embeddingVector.join(",")}]`;

      await prisma.$executeRaw`
        UPDATE "JobListing"
        SET
          "cleanedSummary" = ${cleanedSummary},
          "embedding" = ${vectorString}::vector,
          "classificationStatus" = 'COMPLETED',
          "classificationError" = NULL,
          "classificationAttempts" = ${job.classificationAttempts + 1},
          "updatedAt" = NOW()
        WHERE "id" = ${job.id}
      `;

      logger.info(`[ClassificationWorker] Job ${job.id} classified successfully.`);
      processed++;
    } catch (error: unknown) {
      const attempts = job.classificationAttempts + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = attempts >= maxAttempts;
      const newStatus = isFinalAttempt ? "FAILED" : "PENDING";

      logger.error(
        `[ClassificationWorker] Failed to classify job ${job.id} (attempt ${attempts}/${maxAttempts}). New status: ${newStatus}.`,
        { error: errorMessage }
      );

      await prisma.jobListing.update({
        where: { id: job.id },
        data: {
          classificationStatus: newStatus,
          classificationAttempts: attempts,
          classificationError: errorMessage.substring(0, 1000),
        },
      });

      if (isFinalAttempt) failed++;
    }
  }

  logger.info(
    `[ClassificationWorker] Run complete. Processed: ${processed}, Failed: ${failed}, Total attempted: ${pendingJobs.length}.`
  );

  return { processed, failed, skippedBlocked: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap (called once at server startup via instrumentation.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the classification worker loop at server startup.
 *
 * - Reads `CLASSIFIER_INTERVAL_MINUTES` from SystemConfig (default: 5 min).
 * - Fires one run immediately on startup, then repeats on the configured interval.
 * - Uses a self-rescheduling `setTimeout` (instead of `setInterval`) so that if a
 *   run takes longer than the interval, runs never pile up on top of each other.
 * - Guard flag `isClassifierRunning` prevents duplicate bootstraps on hot-reload.
 */
export async function bootstrapClassificationWorker(): Promise<void> {
  if (isClassifierRunning) {
    logger.info("[ClassificationWorker] Already bootstrapped. Skipping duplicate registration.");
    return;
  }
  isClassifierRunning = true;

  logger.info("[ClassificationWorker] Bootstrapping classification worker loop...");

  async function loop(): Promise<void> {
    // Re-read interval each cycle so live config changes take effect without restart
    const intervalMinutes = await getConfigInt(CONFIG_KEYS.INTERVAL_MINUTES, DEFAULTS.INTERVAL_MINUTES);
    const intervalMs = intervalMinutes * 60 * 1000;

    try {
      await runClassificationWorker();
    } catch (err) {
      logger.error("[ClassificationWorker] Unhandled error in worker loop", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info(`[ClassificationWorker] Next run in ${intervalMinutes} minute(s).`);
    setTimeout(loop, intervalMs);
  }

  // Fire immediately on startup, then self-reschedule
  loop();
}
