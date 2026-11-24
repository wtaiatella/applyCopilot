import type { PoolClient } from "pg";
import { SkillKind } from "@prisma/client";
import { pool, prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { logger } from "@/lib/logging/logger";
import { SkillKeySchema } from "@/lib/validation/skillEmbeddingSchema";

const BACKFILL_ADVISORY_LOCK_KEY = 4501024;
const BACKFILL_CONCURRENCY = 5;

let isBackfillRunning = false;

export interface EmbeddingBackfillResult {
  profilesReset: number;
  skillsCleared: number;
  jobsReindexed: number;
  jobsSkipped: number;
  skillsReindexed: number;
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

function extractSkillField(
  jobFacts: unknown,
  field: "mustHave" | "niceToHave" | "softSkills",
): string[] {
  if (!jobFacts || typeof jobFacts !== "object") {
    return [];
  }

  const rawList = (jobFacts as Record<string, unknown>)[field];
  if (!Array.isArray(rawList)) {
    return [];
  }

  return rawList
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

interface DistinctSkillEntry {
  skill: string;
  displayName: string;
  kind: SkillKind;
}

/**
 * Collects distinct canonical skill keys from persisted `COMPLETED` job facts.
 * Deduplicates case-insensitively and skips entries exceeding the `VarChar(100)`
 * column bound (`SkillKeySchema`). When the same key appears in both hard and
 * soft skill lists across different jobs, assigns the majority `kind` (ties
 * prefer `HARD`), since `SkillEmbedding.skill` is the sole primary key.
 */
function collectDistinctJobSkills(
  completedJobs: Array<{ jobFacts: unknown }>,
): DistinctSkillEntry[] {
  const counts = new Map<
    string,
    { displayName: string; hardCount: number; softCount: number }
  >();

  const register = (raw: string, kind: SkillKind): void => {
    if (!SkillKeySchema.safeParse(raw).success) return;
    const normalized = raw.toLowerCase();
    let entry = counts.get(normalized);
    if (!entry) {
      entry = { displayName: raw, hardCount: 0, softCount: 0 };
      counts.set(normalized, entry);
    }
    if (kind === SkillKind.HARD) {
      entry.hardCount++;
    } else {
      entry.softCount++;
    }
  };

  for (const job of completedJobs) {
    for (const s of extractSkillField(job.jobFacts, "mustHave")) {
      register(s, SkillKind.HARD);
    }
    for (const s of extractSkillField(job.jobFacts, "niceToHave")) {
      register(s, SkillKind.HARD);
    }
    for (const s of extractSkillField(job.jobFacts, "softSkills")) {
      register(s, SkillKind.SOFT);
    }
  }

  return Array.from(counts.entries()).map(([skill, entry]) => ({
    skill,
    displayName: entry.displayName,
    kind: entry.softCount > entry.hardCount ? SkillKind.SOFT : SkillKind.HARD,
  }));
}

/**
 * Runs an embedding-only backfill across `SkillEmbedding`, `UserProfile`, and
 * `COMPLETED` `JobListing` rows (reusing persisted `jobFacts` without
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
        const mustHave = extractSkillField(job.jobFacts, "mustHave");

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

    // Rebuild per-skill semantic vectors in `SkillEmbedding` from persisted
    // `COMPLETED` job facts (mustHave + niceToHave as HARD, softSkills as SOFT)
    // without invoking any LLM — restores Stage-2 max-cosine matching immediately.
    const distinctSkills = collectDistinctJobSkills(completedJobs);
    let skillCursor = 0;
    let skillsReindexed = 0;
    let skillAborted = false;

    const processNextSkill = async (): Promise<void> => {
      while (!skillAborted && skillCursor < distinctSkills.length) {
        const entry = distinctSkills[skillCursor++];
        const embeddingVector = await generateEmbedding(entry.skill);
        const vectorString = `[${embeddingVector.join(",")}]`;

        await prisma.$executeRaw`
          INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
          VALUES (${entry.skill}, ${entry.displayName}, ${entry.kind}::"SkillKind", ${vectorString}::vector)
          ON CONFLICT (skill) DO NOTHING
        `;
        skillsReindexed++;
      }
    };

    const skillWorkerCount = Math.min(
      BACKFILL_CONCURRENCY,
      distinctSkills.length,
    );
    if (skillWorkerCount > 0) {
      try {
        await Promise.all(
          Array.from({ length: skillWorkerCount }, () => processNextSkill()),
        );
      } catch (error) {
        skillAborted = true;
        throw error;
      }
    }

    const result: EmbeddingBackfillResult = {
      profilesReset,
      skillsCleared,
      jobsReindexed,
      jobsSkipped,
      skillsReindexed,
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
