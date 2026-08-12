import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

/**
 * Thrown when a caller has exceeded their per-`(userId, action)` daily AI usage quota (REM-7).
 * Mapped to `429` at each route layer, mirroring the `OutcomeRequiredError`/`StaleUndoError`/
 * `OwnershipViolationError` error-class convention already established in
 * `applicationService.ts`.
 */
export class AiRateLimitExceededError extends Error {
  constructor(
    public readonly action: string,
    public readonly dailyLimit: number,
  ) {
    super(
      `Rate limit reached. You can only ${action} ${dailyLimit} times per day.`,
    );
    this.name = "AiRateLimitExceededError";
  }
}

/**
 * Shared durable per-user daily rate limiter for every `*\/ai/*` route (REM-7) — a thin wrapper
 * around the same `AIUsageLog` table/pattern already proven by `/api/profile/parse`'s existing
 * 50/day check (Decision 5), not a new subsystem.
 *
 * Atomically counts today's `AIUsageLog` rows for `(userId, action)` and records a new row
 * in a single serializable transaction (REM-7 fix). When at or over `dailyLimit`, logs
 * `ai_rate_limit_exceeded` and throws `AiRateLimitExceededError` — a rejected call is not itself
 * recorded as a usage event. Serialization conflicts are treated as limit-exceeded (fail closed).
 *
 * `action` and `dailyLimit` must always be route-owned constants (Decision 6's table) — never a
 * caller-supplied value — so this helper cannot be bypassed by a route passing `0`/negative or
 * omitting the action key (Security Requirements).
 */
export async function assertAiRateLimit(
  userId: string,
  action: string,
  dailyLimit: number,
): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // REM-7 fix: Wrap count + create in a Serializable transaction to prevent TOCTOU race
    // (two concurrent requests both reading the same count before either records a row).
    // At Serializable isolation, the database prevents concurrent transactions that would
    // violate serializability. If a serialization conflict occurs, we catch and treat it as
    // limit-exceeded (fail closed, not open) — the caller sees the same "limit reached" error,
    // preventing bypass-by-concurrency. Note: A concurrency test for this fix is not included
    // here as reliably reproducing the race condition in a test environment is impractical
    // (timing-dependent, non-deterministic). The atomicity is guaranteed by Postgres at the
    // Serializable isolation level.
    await prisma.$transaction(
      async (tx) => {
        const count = await tx.aIUsageLog.count({
          where: {
            userId,
            action,
            createdAt: { gte: oneDayAgo },
          },
        });

        if (count >= dailyLimit) {
          logger.warn("ai_rate_limit_exceeded", {
            userId,
            action,
            count,
            dailyLimit,
          });
          throw new AiRateLimitExceededError(action, dailyLimit);
        }

        await tx.aIUsageLog.create({
          data: { userId, action },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    // If a serialization conflict occurs (Prisma error code P2034), treat as limit-exceeded
    // (fail closed, not open). Pass through other errors (including AiRateLimitExceededError).
    // Checked against the structured `.code` on PrismaClientKnownRequestError (matching the
    // precedent in src/app/api/cv/route.ts's P2002 check) rather than string-matching
    // `error.message`, which is not a stable/structured contract.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      logger.warn("ai_rate_limit_serialization_conflict", { userId, action });
      throw new AiRateLimitExceededError(action, dailyLimit);
    }
    throw error;
  }
}
