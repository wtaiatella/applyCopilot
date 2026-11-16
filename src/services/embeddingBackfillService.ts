import type { PoolClient } from "pg";
import { pool, prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { logger } from "@/lib/logging/logger";

const BACKFILL_ADVISORY_LOCK_KEY = 4501024;
const BACKFILL_CONCURRENCY = 5;

let isBackfillRunning = false;

export interface EmbeddingBackfillResult {
  profilesReset: number;
  skillsCleared: number;
  jobsReindexed: number;
  jobsSkipped: number;
}

/**
 * Thrown when a skill vocabulary / embedding backfill is already executing
 * in-process or on another worker holding the PostgreSQL advisory lock.
 */
export class BackfillInProgressError extends Error {
  public status = 409;

  constructor(
    message = "A skill vocabulary and embedding backfill is already in progress.",
  ) {
    super(message);
    this.name = "BackfillInProgressError";
  }
}

function extractMustHaveSkills(jobFacts: unknown): string[] {
  if (!jobFacts || typeof jobFacts !== "object") {
    return [];
  }

  const rawMustHave = (jobFacts as { mustHave?: unknown }).mustHave;
  if (!Array.isArray(rawMustHave)) {
    return [];
  }

  return rawMustHave
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Runs an embedding-only backfill across `SkillEmbedding`, `UserProfile`, and
 * `COMPLETED` `JobListing` rows (reusing persisted `jobFacts.mustHave` without
 * re-queuing to `PENDING` or invoking LLMs). Guarded by an in-process mutex and
 * a PostgreSQL session advisory lock.
 */
export async function runEmbeddingBackfill(
  userId?: string,
): Promise<EmbeddingBackfillResult> {
  if (isBackfillRunning) {
    throw new BackfillInProgressError();
  }

  isBackfillRunning = true;
  let lockClient: PoolClient | null = null;
  let lockAcquired = false;

  try {
    lockClient = await pool.connect();
    const lockResult = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      [BACKFILL_ADVISORY_LOCK_KEY],
    );
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);

    if (!lockAcquired) {
      throw new BackfillInProgressError();
    }

    logger.warn("embedding_backfill_started", {
      userId: userId ?? null,
    });

    const [skillsCleared, profilesReset] = await prisma.$transaction(
      async (tx) => {
        const deletedSkills = await tx.skillEmbedding.deleteMany({});
        const updatedProfiles = await tx.$executeRaw`
          UPDATE "UserProfile"
          SET "embedding" = NULL, "embeddingSyncedAt" = NULL
          WHERE "embedding" IS NOT NULL OR "embeddingSyncedAt" IS NOT NULL
        `;
        return [deletedSkills.count, updatedProfiles] as const;
      },
    );

    const completedJobs = await prisma.jobListing.findMany({
      where: { classificationStatus: "COMPLETED" },
      select: { id: true, jobFacts: true },
    });

    let cursor = 0;
    let jobsReindexed = 0;
    let jobsSkipped = 0;
    let aborted = false;

    const processNextJob = async (): Promise<void> => {
      while (!aborted && cursor < completedJobs.length) {
        const job = completedJobs[cursor++];
        const mustHave = extractMustHaveSkills(job.jobFacts);

        if (mustHave.length === 0) {
          jobsSkipped++;
          continue;
        }

        const embeddingVector = await generateEmbedding(mustHave.join(" "));
        const vectorString = `[${embeddingVector.join(",")}]`;

        await prisma.$executeRaw`
          UPDATE "JobListing"
          SET
            "embedding" = ${vectorString}::vector,
            "updatedAt" = NOW()
          WHERE "id" = ${job.id}
        `;
        jobsReindexed++;
      }
    };

    const workerCount = Math.min(BACKFILL_CONCURRENCY, completedJobs.length);
    if (workerCount > 0) {
      try {
        await Promise.all(
          Array.from({ length: workerCount }, () => processNextJob()),
        );
      } catch (error) {
        aborted = true;
        throw error;
      }
    }

    const result: EmbeddingBackfillResult = {
      profilesReset,
      skillsCleared,
      jobsReindexed,
      jobsSkipped,
    };

    logger.warn("embedding_backfill_completed", {
      ...result,
      userId: userId ?? null,
    });

    return result;
  } finally {
    if (lockAcquired && lockClient) {
      await lockClient
        .query("SELECT pg_advisory_unlock($1::bigint)", [
          BACKFILL_ADVISORY_LOCK_KEY,
        ])
        .catch((err) => {
          logger.warn("embedding_backfill_advisory_unlock_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
    if (lockClient) {
      lockClient.release();
    }
    isBackfillRunning = false;
  }
}
