import { prisma } from "../db/prisma";
import { AIModel, AIProvider } from "@prisma/client";
import { evaluateAndLazyReset } from "./quota-manager";
import { logger } from "../logging/logger";

export interface ResolvedFreeModel {
  model: AIModel;
  provider: AIProvider;
}

/**
 * Atomically acquires the next available FREE tier model from the round-robin pool.
 * Evaluates rate limits and circuit breaker status, performing lazy resets on counters.
 * Returns null if the free tier pool is currently exhausted or all models are blocked.
 */
export async function acquireNextAvailableFreeModel(): Promise<ResolvedFreeModel | null> {
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
        return null;
      }

      const cursor = await tx.aIRotationCursor.upsert({
        where: { id: 1 },
        create: { id: 1, lastModelId: null },
        update: {},
      });

      const now = new Date();
      const lastIndex = models.findIndex((m) => m.id === cursor.lastModelId);
      const startIndex = lastIndex >= 0 ? (lastIndex + 1) % models.length : 0;

      for (let i = 0; i < models.length; i++) {
        const idx = (startIndex + i) % models.length;
        const candidate = models[idx];

        const evalResult = evaluateAndLazyReset(
          candidate,
          candidate.usageCounter,
          now,
        );

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
            model: candidate,
            provider: candidate.provider,
          };
        } else {
          logger.debug(
            `[RotationCursor] Skipped model ${candidate.displayName} (blocked or quota full)`,
            {
              modelId: candidate.id,
              isBlocked: Boolean(
                candidate.blockedUntil && candidate.blockedUntil > now,
              ),
              minuteUsage: `${evalResult.countRequestsMin}/${evalResult.effectiveRpm}`,
              dayUsage: `${evalResult.countRequestsDay}/${evalResult.effectiveRpd}`,
            },
          );
        }
      }

      logger.warn(
        `[RotationCursor] All ${models.length} FREE models are exhausted or blocked`,
      );
      return null;
    });
  } catch (error) {
    logger.error("[RotationCursor] Transaction failed during model selection", {
      error,
    });
    return null;
  }
}
