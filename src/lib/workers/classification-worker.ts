import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";
import {
  extractHttpStatus,
  isBlockingHttpStatus,
  isProviderBlocked,
  withCircuitBreaker,
} from "../ai/circuit-breaker";
import { AIWorkerBackoffError, resolveAIConfig } from "../ai/aiClient";
import {
  classifyJobListing,
  canonicalizeJobFacts,
} from "../../services/jobClassificationService";
import { generateEmbedding } from "../ai/vector-service";
import {
  JobFactsSchema,
  describeUntrustedForLog,
} from "../validation/jobFactsSchema";

/** The SystemConfig key for the Parsing Provider capability */
const PARSING_PROVIDER_KEY = "AI_PROVIDER_PARSING";

/** The SystemConfig key for the Embedding Provider capability (FR-23, separate circuit breaker from parsing) */
const EMBEDDING_PROVIDER_KEY = "AI_PROVIDER_EMBEDDING";

/** Guard to prevent multiple bootstrap calls */
let isClassifierRunning = false;

/** Guard to prevent overlapping concurrent drain runs */
let isDrainRunning = false;

/** Graceful shutdown state flag */
let isShuttingDown = false;

/** Guard to avoid registering duplicate process signal listeners */
let areShutdownListenersRegistered = false;

/** Active idle polling timer reference */
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// SystemConfig helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a numeric value from SystemConfig. Falls back to `defaultVal` if the key
 * is missing, empty, or not a valid positive integer.
 */
async function getConfigInt(key: string, defaultVal: number): Promise<number> {
  try {
    const row = await prisma.systemConfig?.findUnique?.({ where: { key } });
    const parsed = parseInt(row?.value ?? "", 10);
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
 * | CLASSIFIER_BATCH_SIZE            | 20      | Max jobs fetched from DB per batch iteration     |
 * | CLASSIFIER_MAX_ATTEMPTS          | 3       | Max LLM attempts per job before marking FAILED   |
 * | CLASSIFIER_COOLDOWN_MINUTES      | 60      | How long a BLOCKED provider stays blocked        |
 * | CLASSIFIER_CONCURRENCY           | 3       | Max jobs classified concurrently per batch (1..10)|
 */
const CONFIG_KEYS = {
  INTERVAL_MINUTES: "CLASSIFIER_INTERVAL_MINUTES",
  BATCH_SIZE: "CLASSIFIER_BATCH_SIZE",
  MAX_ATTEMPTS: "CLASSIFIER_MAX_ATTEMPTS",
  COOLDOWN_MINUTES: "CLASSIFIER_COOLDOWN_MINUTES",
  CONCURRENCY: "CLASSIFIER_CONCURRENCY",
} as const;

const DEFAULTS = {
  INTERVAL_MINUTES: 5,
  BATCH_SIZE: 20,
  MAX_ATTEMPTS: 3,
  COOLDOWN_MINUTES: 60,
  CONCURRENCY: 3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Capacity Error Detection & Lifecycle Recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines whether an error represents AI capacity unavailability (rate limits,
 * per-minute/daily quota exhaustion, or blocked models) rather than a listing-specific error.
 */
export function isCapacityUnavailabilityError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof AIWorkerBackoffError) {
    return true;
  }

  if (
    typeof error === "object" &&
    (error as { name?: string }).name === "AIWorkerBackoffError"
  ) {
    return true;
  }

  const statusCode = extractHttpStatus(error);
  if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
    return true;
  }

  return false;
}

/**
 * Resets any job listings stuck in `RUNNING` classification status back to `PENDING`
 * without modifying `classificationAttempts` or losing listing data.
 */
export async function recoverRunningClassifications(
  trigger: "startup" | "shutdown" = "startup",
): Promise<number> {
  try {
    const result = await prisma.jobListing?.updateMany?.({
      where: { classificationStatus: "RUNNING" },
      data: { classificationStatus: "PENDING" },
    });
    const recoveredCount = result?.count ?? 0;
    logger.info(
      "[ClassificationWorker] Recovered interrupted RUNNING job listings to PENDING.",
      { recoveredCount, trigger },
    );
    return recoveredCount;
  } catch (error) {
    logger.error(
      "[ClassificationWorker] Failed to recover RUNNING job listings.",
      {
        trigger,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return 0;
  }
}

/**
 * Handles graceful shutdown signals (`SIGTERM` / `SIGINT`) by halting active drain loops,
 * clearing the idle polling timer, and resetting any in-flight `RUNNING` jobs to `PENDING`.
 */
export async function gracefulShutdownClassificationWorker(
  signal = "SIGTERM",
): Promise<void> {
  logger.info(
    `[ClassificationWorker] Received ${signal}. Initiating graceful shutdown...`,
    { signal },
  );
  isShuttingDown = true;

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  try {
    await recoverRunningClassifications("shutdown");
  } finally {
    if (!isDrainRunning) {
      isShuttingDown = false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker run
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerRunResult {
  processed: number;
  failed: number;
  skippedBlocked: boolean;
  batchesProcessed?: number;
  pausedForMinuteQuotaCount?: number;
}

export interface ClassificationWorkerOptions {
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleepFn = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function buildWorkerRunResult(
  processed: number,
  failed: number,
  skippedBlocked: boolean,
  batchesProcessed: number,
  pausedForMinuteQuotaCount: number,
): WorkerRunResult {
  const result: WorkerRunResult = {
    processed,
    failed,
    skippedBlocked,
  };
  Object.defineProperties(result, {
    batchesProcessed: {
      value: batchesProcessed,
      enumerable: false,
      writable: true,
      configurable: true,
    },
    pausedForMinuteQuotaCount: {
      value: pausedForMinuteQuotaCount,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
  return result;
}

/**
 * Background classification worker — continuous queue-draining & concurrent processing loop.
 *
 * On each invocation:
 * 1. Continuously fetches batches of eligible `PENDING` listings ordered by `createdAt: "desc"`
 *    until `0` eligible listings remain.
 * 2. Re-reads runtime configuration (`CLASSIFIER_BATCH_SIZE`, `CLASSIFIER_MAX_ATTEMPTS`,
 *    `CLASSIFIER_COOLDOWN_MINUTES`, `CLASSIFIER_CONCURRENCY` clamped `1..10`) at the start
 *    of each batch iteration so administrator changes take effect immediately.
 * 3. Processes listings within each batch concurrently using a bounded worker pool.
 * 4. Separates AI capacity unavailability from listing-specific errors:
 *    - Capacity errors (`AIWorkerBackoffError`, HTTP `429`/`401`/`402`) revert the listing
 *      to `PENDING` with `classificationAttempts` unchanged.
 *    - `MINUTE_QUOTA` exhaustion pauses for `retryAfterSeconds` (1..60s) and resumes draining.
 *    - `DAILY_QUOTA` / `ALL_MODELS_BLOCKED` / provider blocks log the reason and exit to idle.
 *    - Listing-specific errors (including `JobFactsSchema` validation failures) increment
 *      `classificationAttempts` by 1, returning to `PENDING` while `< maxAttempts` (default 3)
 *      and marking `FAILED` on the 3rd attempt.
 */
export async function runClassificationWorker(
  options?: ClassificationWorkerOptions,
): Promise<WorkerRunResult> {
  if (isDrainRunning) {
    logger.info(
      "[ClassificationWorker] Drain cycle already in progress. Skipping overlapping run.",
    );
    return buildWorkerRunResult(0, 0, false, 0, 0);
  }

  const sleepFn = options?.sleepFn ?? defaultSleepFn;
  isDrainRunning = true;

  let processed = 0;
  let failed = 0;
  let skippedBlocked = false;
  let batchesProcessed = 0;
  let pausedForMinuteQuotaCount = 0;

  // Tracks `${job.id}:${job.classificationAttempts}` settled within this drain run
  // so null-description rows or static test mocks are not re-processed infinitely.
  const settledJobStates = new Set<string>();

  try {
    while (!isShuttingDown) {
      // Step 1: Load runtime config from SystemConfig on every batch iteration
      const [batchSize, maxAttempts, cooldownMinutes, rawConcurrency] =
        await Promise.all([
          getConfigInt(CONFIG_KEYS.BATCH_SIZE, DEFAULTS.BATCH_SIZE),
          getConfigInt(CONFIG_KEYS.MAX_ATTEMPTS, DEFAULTS.MAX_ATTEMPTS),
          getConfigInt(CONFIG_KEYS.COOLDOWN_MINUTES, DEFAULTS.COOLDOWN_MINUTES),
          getConfigInt(CONFIG_KEYS.CONCURRENCY, DEFAULTS.CONCURRENCY),
        ]);

      const concurrency = Math.min(10, Math.max(1, rawConcurrency));
      const cooldownMs = cooldownMinutes * 60 * 1000;

      if (batchesProcessed === 0 && pausedForMinuteQuotaCount === 0) {
        logger.info(
          "[ClassificationWorker] Starting continuous classification drain...",
          {
            batchSize,
            concurrency,
            maxAttempts,
            cooldownMinutes,
          },
        );
      }

      // Resolve the currently-configured provider for each capability
      const { provider: parsingProvider } = await resolveAIConfig("parsing");
      const { provider: embeddingProvider } =
        await resolveAIConfig("embedding");

      // Step 2: Check if the (parsing capability, currently-configured provider) pair is blocked
      const blocked = await isProviderBlocked(
        PARSING_PROVIDER_KEY,
        parsingProvider,
      );

      if (blocked) {
        logger.warn(
          `[ClassificationWorker] Parsing provider (${PARSING_PROVIDER_KEY}/${parsingProvider}) is BLOCKED. Stopping drain cycle and returning to idle polling.`,
          {
            exhaustionReason: "PROVIDER_BLOCKED",
            provider: parsingProvider,
          },
        );
        skippedBlocked = true;
        break;
      }

      // Step 3: Fetch next batch of eligible pending jobs ordered newest-first
      const fetchedJobs = await prisma.jobListing.findMany({
        where: {
          isFullDescriptionFetched: true,
          classificationStatus: "PENDING",
          classificationAttempts: { lt: maxAttempts },
        },
        take: batchSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          company: true,
          fullDescription: true,
          classificationAttempts: true,
        },
      });

      const pendingJobs = (fetchedJobs ?? []).filter(
        (job) =>
          !settledJobStates.has(`${job.id}:${job.classificationAttempts}`),
      );

      if (pendingJobs.length === 0) {
        if (batchesProcessed === 0) {
          logger.info(
            "[ClassificationWorker] No pending jobs to classify. Worker run complete.",
          );
        }
        break;
      }

      batchesProcessed++;
      logger.info(
        `[ClassificationWorker] Processing batch of ${pendingJobs.length} pending job(s)`,
        {
          batchNumber: batchesProcessed,
          batchCount: pendingJobs.length,
          concurrency,
        },
      );

      // Step 4: Process batch concurrently with a bounded worker pool & shared capacity abort signal
      let nextJobIndex = 0;
      let capacityExhaustedError: unknown = null;
      const poolSize = Math.min(concurrency, pendingJobs.length);

      const workers = Array.from({ length: poolSize }, async () => {
        while (!isShuttingDown && capacityExhaustedError === null) {
          const currentIndex = nextJobIndex++;
          if (currentIndex >= pendingJobs.length) {
            break;
          }

          const job = pendingJobs[currentIndex];
          const stateKey = `${job.id}:${job.classificationAttempts}`;

          if (!job.fullDescription) {
            logger.warn(
              `[ClassificationWorker] Job ${job.id} has no fullDescription. Skipping.`,
            );
            settledJobStates.add(stateKey);
            continue;
          }

          // Mark as RUNNING
          await prisma.jobListing.update({
            where: { id: job.id },
            data: { classificationStatus: "RUNNING" },
          });

          try {
            // LLM extraction — circuit breaker uses the configured cooldown
            const { jobFacts } = await withCircuitBreaker(
              PARSING_PROVIDER_KEY,
              parsingProvider,
              () =>
                classifyJobListing({
                  id: job.id,
                  title: job.title,
                  company: job.company,
                  fullDescription: job.fullDescription!,
                }),
              cooldownMs,
            );

            // Canonicalize mustHave/niceToHave/softSkills against the write-path vocabulary
            const canonicalizedJobFacts = await canonicalizeJobFacts(jobFacts);

            // Validate the extracted JobFacts shape — schema validation failures follow
            // the unified 3-attempt listing-specific failure rule (FR-10, AC.6).
            // Capture the raw AI period before parse so a value nulled by the schema
            // preprocess (unrecognised string) can be logged (spectech D10).
            const rawSalaryPeriod = (
              canonicalizedJobFacts as { salaryPeriod?: unknown }
            ).salaryPeriod;
            const parseResult = JobFactsSchema.safeParse(canonicalizedJobFacts);
            if (!parseResult.success) {
              throw new Error(parseResult.error.message);
            }

            // Always persist salaryPeriod explicitly (null = unknown) so new facts are
            // never mistaken for legacy facts, whose key is absent (tri-state).
            const persistedFacts = {
              ...parseResult.data,
              salaryPeriod: parseResult.data.salaryPeriod ?? null,
            };

            if (
              persistedFacts.salaryPeriod === null &&
              rawSalaryPeriod !== undefined &&
              rawSalaryPeriod !== null
            ) {
              logger.warn("Unrecognised salary period dropped", {
                jobId: job.id,
                ...describeUntrustedForLog(rawSalaryPeriod),
              });
            }
            if (
              persistedFacts.salaryPeriod === null &&
              (persistedFacts.salaryMin !== null ||
                persistedFacts.salaryMax !== null)
            ) {
              logger.info("Job salary period unknown", {
                jobId: job.id,
                hasMin: persistedFacts.salaryMin !== null,
                hasMax: persistedFacts.salaryMax !== null,
                currency: persistedFacts.currency,
              });
            }

            // Generate the embedding vector for the must-have skill list, under a separate
            // circuit breaker key from the parsing provider (FR-23).
            const embeddingVector = await withCircuitBreaker(
              EMBEDDING_PROVIDER_KEY,
              embeddingProvider,
              () => generateEmbedding(parseResult.data.mustHave.join(" ")),
              cooldownMs,
            );

            // Persist via raw SQL (Prisma does not support pgvector in update())
            const vectorString = `[${embeddingVector.join(",")}]`;

            await prisma.$executeRaw`
              UPDATE "JobListing"
              SET
                "jobFacts" = ${JSON.stringify(persistedFacts)}::jsonb,
                "embedding" = ${vectorString}::vector,
                "classificationStatus" = 'COMPLETED',
                "classificationError" = NULL,
                "classificationAttempts" = ${job.classificationAttempts + 1},
                "updatedAt" = NOW()
              WHERE "id" = ${job.id}
            `;

            settledJobStates.add(stateKey);
            processed++;
            logger.info(
              `[ClassificationWorker] Job ${job.id} classified successfully.`,
            );
          } catch (error: unknown) {
            if (isShuttingDown) {
              await prisma.jobListing.update({
                where: { id: job.id },
                data: { classificationStatus: "PENDING" },
              });
              break;
            }

            if (isCapacityUnavailabilityError(error)) {
              if (capacityExhaustedError === null) {
                capacityExhaustedError = error;
              }
              await prisma.jobListing.update({
                where: { id: job.id },
                data: { classificationStatus: "PENDING" },
              });
              break;
            }

            // Listing-specific error (schema validation failure or non-capacity runtime error)
            settledJobStates.add(stateKey);
            const attempts = job.classificationAttempts + 1;
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const isFinalAttempt = attempts >= maxAttempts;
            const newStatus = isFinalAttempt ? "FAILED" : "PENDING";

            logger.error(
              `[ClassificationWorker] Failed to classify job ${job.id} (attempt ${attempts}/${maxAttempts}). New status: ${newStatus}.`,
              {
                jobId: job.id,
                attempts,
                maxAttempts,
                newStatus,
                error: errorMessage,
              },
            );

            await prisma.jobListing.update({
              where: { id: job.id },
              data: {
                classificationStatus: newStatus,
                classificationAttempts: attempts,
                classificationError: errorMessage.substring(0, 1000),
              },
            });

            if (isFinalAttempt) {
              failed++;
            }
          }
        }
      });

      await Promise.allSettled(workers);

      if (isShuttingDown) {
        break;
      }

      // Step 5: Handle batch-level AI capacity unavailability
      if (capacityExhaustedError !== null) {
        const isBackoffErr =
          capacityExhaustedError instanceof AIWorkerBackoffError ||
          (typeof capacityExhaustedError === "object" &&
            (capacityExhaustedError as { name?: string })?.name ===
              "AIWorkerBackoffError");

        const exhaustionReason = isBackoffErr
          ? ((capacityExhaustedError as AIWorkerBackoffError)
              .exhaustionReason ?? "MINUTE_QUOTA")
          : "PROVIDER_RATE_LIMIT_OR_BLOCK";

        if (isBackoffErr && exhaustionReason === "MINUTE_QUOTA") {
          const rawRetryAfter =
            (capacityExhaustedError as AIWorkerBackoffError)
              .retryAfterSeconds ?? 60;
          const waitSeconds = Math.min(60, Math.max(1, rawRetryAfter));

          logger.warn(
            `[ClassificationWorker] Per-minute AI quota exhausted. Pausing for ${waitSeconds}s until minute window resets...`,
            {
              exhaustionReason: "MINUTE_QUOTA",
              waitSeconds,
            },
          );

          pausedForMinuteQuotaCount++;
          await sleepFn(waitSeconds * 1000);
          continue;
        }

        logger.warn(
          "[ClassificationWorker] AI capacity unavailable. Stopping drain cycle and returning to idle polling.",
          {
            exhaustionReason,
            provider: parsingProvider,
          },
        );
        skippedBlocked = true;
        break;
      }
    }

    logger.info("[ClassificationWorker] Drain cycle complete.", {
      processed,
      failed,
      batchesProcessed,
      pausedForMinuteQuotaCount,
    });

    return buildWorkerRunResult(
      processed,
      failed,
      skippedBlocked,
      batchesProcessed,
      pausedForMinuteQuotaCount,
    );
  } finally {
    isDrainRunning = false;
    isShuttingDown = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap (called once at server startup via instrumentation.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the classification worker loop at server startup.
 *
 * - Registers one-time `SIGTERM` and `SIGINT` handlers for graceful recovery.
 * - Reads `CLASSIFIER_INTERVAL_MINUTES` from SystemConfig (default: 5 min).
 * - Fires one run immediately on startup, then repeats on the configured interval.
 * - Uses a self-rescheduling `setTimeout` (instead of `setInterval`) so that if a
 *   run takes longer than the interval, runs never pile up on top of each other.
 * - Guard flag `isClassifierRunning` prevents duplicate bootstraps on hot-reload.
 */
export async function bootstrapClassificationWorker(): Promise<void> {
  if (isClassifierRunning) {
    logger.info(
      "[ClassificationWorker] Already bootstrapped. Skipping duplicate registration.",
    );
    return;
  }
  isClassifierRunning = true;

  if (
    !areShutdownListenersRegistered &&
    typeof process !== "undefined" &&
    typeof process.once === "function"
  ) {
    areShutdownListenersRegistered = true;
    process.once("SIGTERM", () => {
      void gracefulShutdownClassificationWorker("SIGTERM");
    });
    process.once("SIGINT", () => {
      void gracefulShutdownClassificationWorker("SIGINT");
    });
  }

  logger.info(
    "[ClassificationWorker] Bootstrapping classification worker loop...",
  );

  async function loop(): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    // Re-read interval each cycle so live config changes take effect without restart
    const intervalMinutes = await getConfigInt(
      CONFIG_KEYS.INTERVAL_MINUTES,
      DEFAULTS.INTERVAL_MINUTES,
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    try {
      await runClassificationWorker();
    } catch (err) {
      logger.error("[ClassificationWorker] Unhandled error in worker loop", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!isShuttingDown) {
      logger.info(
        `[ClassificationWorker] Next run in ${intervalMinutes} minute(s).`,
      );
      idleTimer = setTimeout(loop, intervalMs);
    }
  }

  // Fire immediately on startup, then self-reschedule
  void loop();
}
