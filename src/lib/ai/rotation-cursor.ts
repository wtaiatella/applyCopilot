import { prisma } from "../db/prisma";
import { AIModel, AIProvider } from "@prisma/client";
import { evaluateAndLazyReset } from "./quota-manager";
import { logger } from "../logging/logger";

export interface ResolvedFreeModel {
  model: AIModel;
  provider: AIProvider;
}

export type PoolExhaustionReason =
  | "MINUTE_QUOTA"
  | "DAILY_QUOTA"
  | "ALL_MODELS_BLOCKED"
  | "NO_MODELS";

export interface AcquireModelOptions {
  isWorker?: boolean;
  activeUserRequests?: number;
}

export interface FreeModelAcquisitionResult {
  resolved: ResolvedFreeModel | null;
  exhaustionReason: PoolExhaustionReason | null;
  retryAfterSeconds: number | null;
}

/**
 * Atomically acquires the next available FREE tier model from the round-robin pool
 * along with granular pool exhaustion diagnostics when no model is available.
 */
export async function acquireFreeModelWithDiagnostics(
  options?: AcquireModelOptions,
): Promise<FreeModelAcquisitionResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const models = await tx.aIModel.findMany({
        where: {
          tier: "FREE",
          isEnabled: true,
        },
        include: {
          provider: true,
          usageCounter: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (models.length === 0) {
        logger.warn("[RotationCursor] No enabled FREE tier models in registry");
        return {
          resolved: null,
          exhaustionReason: "NO_MODELS",
          retryAfterSeconds: null,
        };
      }

      const cursor = await tx.aIRotationCursor.upsert({
        where: { id: 1 },
        create: { id: 1, lastModelId: null },
        update: {},
      });

      const now = new Date();
      const lastIndex = models.findIndex((m) => m.id === cursor.lastModelId);
      const startIndex = lastIndex >= 0 ? (lastIndex + 1) % models.length : 0;

      let unblockedCount = 0;
      let unblockedWithDayQuotaCount = 0;
      let minResetsMinInSeconds = Number.POSITIVE_INFINITY;

      for (let i = 0; i < models.length; i++) {
        const idx = (startIndex + i) % models.length;
        const candidate = models[idx];

        const evalResult = evaluateAndLazyReset(
          candidate,
          candidate.usageCounter,
          now,
          options,
        );

        if (!evalResult.isBlocked) {
          unblockedCount++;
          if (evalResult.hasDayQuota) {
            unblockedWithDayQuotaCount++;
            minResetsMinInSeconds = Math.min(
              minResetsMinInSeconds,
              evalResult.resetsMinInSeconds,
            );
          }
        }

        if (evalResult.isAvailable) {
          // Increment counters in place
          await tx.aIUsageCounter.upsert({
            where: { modelId: candidate.id },
            create: {
              modelId: candidate.id,
              windowStartMin: evalResult.windowStartMin,
              countRequestsMin: evalResult.countRequestsMin + 1,
              countTokensMin: 0,
              windowStartDay: evalResult.windowStartDay,
              countRequestsDay: evalResult.countRequestsDay + 1,
              countTokensDay: 0,
            },
            update: {
              windowStartMin: evalResult.windowStartMin,
              countRequestsMin: evalResult.countRequestsMin + 1,
              windowStartDay: evalResult.windowStartDay,
              countRequestsDay: evalResult.countRequestsDay + 1,
            },
          });

          // Advance rotation cursor
          await tx.aIRotationCursor.update({
            where: { id: 1 },
            data: { lastModelId: candidate.id },
          });

          logger.info(
            `[RotationCursor] Selected model ${candidate.displayName} (${candidate.modelId}) via provider ${candidate.provider.name}`,
            {
              modelId: candidate.id,
              minuteUsage: `${evalResult.countRequestsMin + 1}/${evalResult.effectiveRpm}`,
              dayUsage: `${evalResult.countRequestsDay + 1}/${evalResult.effectiveRpd}`,
            },
          );

          return {
            resolved: {
              model: candidate,
              provider: candidate.provider,
            },
            exhaustionReason: null,
            retryAfterSeconds: null,
          };
        } else {
          logger.debug(
            `[RotationCursor] Skipped model ${candidate.displayName} (blocked or quota full)`,
            {
              modelId: candidate.id,
              isBlocked: evalResult.isBlocked,
              minuteUsage: `${evalResult.countRequestsMin}/${evalResult.effectiveRpm}`,
              dayUsage: `${evalResult.countRequestsDay}/${evalResult.effectiveRpd}`,
            },
          );
        }
      }

      let exhaustionReason: PoolExhaustionReason;
      let retryAfterSeconds: number | null = null;

      if (unblockedCount === 0) {
        exhaustionReason = "ALL_MODELS_BLOCKED";
      } else if (unblockedWithDayQuotaCount > 0) {
        exhaustionReason = "MINUTE_QUOTA";
        const rawWait = Number.isFinite(minResetsMinInSeconds)
          ? minResetsMinInSeconds
          : 60;
        retryAfterSeconds = Math.max(1, Math.min(60, rawWait));
      } else {
        exhaustionReason = "DAILY_QUOTA";
      }

      logger.warn(
        `[RotationCursor] All FREE models unavailable`,
        {
          exhaustionReason,
          retryAfterSeconds,
          isWorker: Boolean(options?.isWorker),
          modelCount: models.length,
        },
      );

      return {
        resolved: null,
        exhaustionReason,
        retryAfterSeconds,
      };
    });
  } catch (error) {
    logger.error("[RotationCursor] Transaction failed during model selection", {
      error,
    });
    return {
      resolved: null,
      exhaustionReason: "ALL_MODELS_BLOCKED",
      retryAfterSeconds: null,
    };
  }
}

/**
 * Atomically acquires the next available FREE tier model from the round-robin pool.
 * Evaluates rate limits and circuit breaker status, performing lazy resets on counters.
 * Returns null if the free tier pool is currently exhausted or all models are blocked.
 */
export async function acquireNextAvailableFreeModel(
  options?: AcquireModelOptions,
): Promise<ResolvedFreeModel | null> {
  const result = await acquireFreeModelWithDiagnostics(options);
  return result.resolved;
}
