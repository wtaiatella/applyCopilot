import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";
import { AIRouteId } from "@/types/ai-manager";
import {
  acquireFreeModelWithDiagnostics,
  FreeModelAcquisitionResult,
  PoolExhaustionReason,
  ResolvedFreeModel,
} from "./rotation-cursor";
import { GoogleGenAIAdapter } from "./adapters/googleGenAIAdapter";
import { OpenAICompatAdapter } from "./adapters/openAICompatAdapter";
import { OllamaAdapter } from "./adapters/ollamaAdapter";
import { withCircuitBreaker } from "./circuit-breaker";

export type ChatCapability =
  | "parsing"
  | "summaries"
  | "default"
  | "profile"
  | "skillAlias";

export type AIRouteOrCapability = AIRouteId | ChatCapability;

let activeUserRequests = 0;

export function getActiveUserRequestCount(): number {
  return activeUserRequests;
}

export class AIServiceUnavailableError extends Error {
  public status: number = 503;
  constructor(message = "AI service temporarily unavailable across all providers. Please try again later.") {
    super(message);
    this.name = "AIServiceUnavailableError";
  }
}

export class AIWorkerBackoffError extends Error {
  public status: number = 429;
  public backoffMinutes: number = 5;
  public exhaustionReason: PoolExhaustionReason;
  public retryAfterSeconds: number | null;

  constructor(
    message = "All free-tier AI models and local fallbacks are currently exhausted. Worker pausing for 5 minutes.",
    exhaustionReason: PoolExhaustionReason = "MINUTE_QUOTA",
    retryAfterSeconds: number | null = exhaustionReason === "MINUTE_QUOTA" ? 60 : null,
  ) {
    super(message);
    this.name = "AIWorkerBackoffError";
    this.exhaustionReason = exhaustionReason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Maps legacy capability names to canonical route IDs.
 */
function normalizeToRouteId(routeOrCapability: AIRouteOrCapability): AIRouteId {
  switch (routeOrCapability) {
    case "parsing":
      return "cv.parse.basicData";
    case "summaries":
      return "jobs.deepAnalysis";
    case "profile":
      return "profile.syncFacts";
    case "skillAlias":
      return "profile.skillAlias";
    case "default":
      return "profile.skillsSuggest";
    default:
      return routeOrCapability as AIRouteId;
  }
}

/**
 * Resolves the route configuration for a given route ID.
 */
export async function resolveAIRoute(routeId: AIRouteId) {
  try {
    const route = await prisma.aIRoutePreference.findUnique({
      where: { routeId },
    });
    if (route) return route;
  } catch (error) {
    logger.warn("[AIClient] Failed to read route preference, defaulting to FREE", { error, routeId });
  }

  return {
    routeId,
    groupName: "Default",
    displayName: routeId,
    preferredTier: "FREE" as const,
    isWorker: ["jobs.classification", "profile.syncFacts", "profile.skillAlias"].includes(routeId),
    updatedAt: new Date(),
  };
}

/**
 * Legacy compatibility resolver (used for embedding or legacy tests).
 */
export async function resolveAIConfig(
  capability: "embedding",
): Promise<{ provider: "ollama" | "gemini" | "claude"; model: string }>;
export async function resolveAIConfig(
  capability: ChatCapability,
): Promise<{ provider: "ollama" | "gemini" | "claude" | "gemma-26b" | "gemma-31b"; model: string }>;
export async function resolveAIConfig(
  capability: ChatCapability | "embedding",
): Promise<{ provider: "ollama" | "gemini" | "claude" | "gemma-26b" | "gemma-31b"; model: string }> {
  if (capability === "embedding") {
    return {
      provider: "gemini",
      model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
    };
  }

  return {
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
  };
}

async function executeWithModel(
  resolved: ResolvedFreeModel,
  type: "text" | "json",
  prompt: string,
  systemPrompt?: string,
): Promise<unknown> {
  const { model, provider } = resolved;

  return await withCircuitBreaker(
    model.id,
    provider.name,
    async () => {
      if (provider.sdkType === "GOOGLE_GENAI") {
        return type === "text"
          ? await GoogleGenAIAdapter.executeText(prompt, model, provider, systemPrompt)
          : await GoogleGenAIAdapter.executeJSON(prompt, model, provider, systemPrompt);
      }
      if (provider.sdkType === "OPENAI_COMPATIBLE") {
        return type === "text"
          ? await OpenAICompatAdapter.executeText(prompt, model, provider, systemPrompt)
          : await OpenAICompatAdapter.executeJSON(prompt, model, provider, systemPrompt);
      }
      // OLLAMA as free model
      return type === "text"
        ? await OllamaAdapter.executeText(prompt, systemPrompt)
        : await OllamaAdapter.executeJSON(prompt, systemPrompt);
    },
  );
}

async function executeWithOllama(
  type: "text" | "json",
  prompt: string,
  systemPrompt?: string,
): Promise<unknown> {
  return type === "text"
    ? await OllamaAdapter.executeText(prompt, systemPrompt)
    : await OllamaAdapter.executeJSON(prompt, systemPrompt);
}

async function acquireFreeModelForRoute(
  isWorker: boolean,
): Promise<FreeModelAcquisitionResult> {
  if (isWorker && activeUserRequests > 0) {
    // Yield briefly so in-flight interactive user requests acquire free-tier capacity first
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return await acquireFreeModelWithDiagnostics({
    isWorker,
    activeUserRequests,
  });
}

/**
 * Central dispatcher for text generation requests across free-tier rotation pool & local fallback.
 */
export async function generateText(
  prompt: string,
  routeOrCap: AIRouteOrCapability = "default",
  systemPrompt?: string,
): Promise<string> {
  const routeId = normalizeToRouteId(routeOrCap);
  const route = await resolveAIRoute(routeId);

  logger.info(`[AIClient] Routing request for ${routeId} (preferred: ${route.preferredTier})`);

  if (!route.isWorker) {
    activeUserRequests++;
  }

  let lastAcquisition: FreeModelAcquisitionResult | null = null;

  try {
    if (route.preferredTier === "LOCAL") {
      // 1. Try Local Ollama first
      try {
        return (await executeWithOllama("text", prompt, systemPrompt)) as string;
      } catch (ollamaErr) {
        logger.warn(`[AIClient] Local Ollama failed for ${routeId}, attempting FREE tier fallback`, { error: ollamaErr });

        // 2. Fallback to FREE tier pool
        lastAcquisition = await acquireFreeModelForRoute(route.isWorker);
        const freeModel = lastAcquisition.resolved;
        if (freeModel) {
          try {
            return (await executeWithModel(freeModel, "text", prompt, systemPrompt)) as string;
          } catch (freeErr) {
            logger.error(`[AIClient] FREE tier fallback failed for ${routeId}`, { error: freeErr });
          }
        }
      }
    } else {
      // 1. Try FREE tier rotation pool first
      lastAcquisition = await acquireFreeModelForRoute(route.isWorker);
      const freeModel = lastAcquisition.resolved;
      if (freeModel) {
        try {
          return (await executeWithModel(freeModel, "text", prompt, systemPrompt)) as string;
        } catch (freeErr) {
          logger.warn(`[AIClient] FREE tier model ${freeModel.model.displayName} failed, attempting Local Ollama fallback`, { error: freeErr });
        }
      } else {
        logger.warn(`[AIClient] FREE tier pool exhausted for ${routeId}, attempting Local Ollama fallback`, {
          exhaustionReason: lastAcquisition.exhaustionReason,
          retryAfterSeconds: lastAcquisition.retryAfterSeconds,
        });
      }

      // 2. Fallback to Local Ollama
      try {
        return (await executeWithOllama("text", prompt, systemPrompt)) as string;
      } catch (ollamaErr) {
        logger.error(`[AIClient] Local Ollama fallback failed for ${routeId}`, { error: ollamaErr });
      }
    }

    // 3. Fallback Exhaustion
    logger.error(`[AIClient] Fallback exhaustion for route ${routeId} (isWorker: ${route.isWorker})`);
    if (route.isWorker) {
      const exhaustionReason = lastAcquisition?.exhaustionReason ?? "MINUTE_QUOTA";
      const retryAfterSeconds =
        lastAcquisition?.retryAfterSeconds ??
        (exhaustionReason === "MINUTE_QUOTA" ? 60 : null);
      throw new AIWorkerBackoffError(undefined, exhaustionReason, retryAfterSeconds);
    } else {
      throw new AIServiceUnavailableError();
    }
  } finally {
    if (!route.isWorker) {
      activeUserRequests = Math.max(0, activeUserRequests - 1);
    }
  }
}

/**
 * Central dispatcher for JSON generation requests across free-tier rotation pool & local fallback.
 */
export async function generateJSON<T>(
  prompt: string,
  routeOrCap: AIRouteOrCapability = "default",
  systemPrompt?: string,
): Promise<T> {
  const routeId = normalizeToRouteId(routeOrCap);
  const route = await resolveAIRoute(routeId);

  logger.info(`[AIClient] Routing JSON request for ${routeId} (preferred: ${route.preferredTier})`);

  if (!route.isWorker) {
    activeUserRequests++;
  }

  let lastAcquisition: FreeModelAcquisitionResult | null = null;

  try {
    if (route.preferredTier === "LOCAL") {
      // 1. Try Local Ollama first
      try {
        return (await executeWithOllama("json", prompt, systemPrompt)) as T;
      } catch (ollamaErr) {
        logger.warn(`[AIClient] Local Ollama failed for JSON ${routeId}, attempting FREE tier fallback`, { error: ollamaErr });

        // 2. Fallback to FREE tier pool
        lastAcquisition = await acquireFreeModelForRoute(route.isWorker);
        const freeModel = lastAcquisition.resolved;
        if (freeModel) {
          try {
            return (await executeWithModel(freeModel, "json", prompt, systemPrompt)) as T;
          } catch (freeErr) {
            logger.error(`[AIClient] FREE tier fallback failed for JSON ${routeId}`, { error: freeErr });
          }
        }
      }
    } else {
      // 1. Try FREE tier rotation pool first
      lastAcquisition = await acquireFreeModelForRoute(route.isWorker);
      const freeModel = lastAcquisition.resolved;
      if (freeModel) {
        try {
          return (await executeWithModel(freeModel, "json", prompt, systemPrompt)) as T;
        } catch (freeErr) {
          logger.warn(`[AIClient] FREE tier model ${freeModel.model.displayName} failed for JSON, attempting Local Ollama fallback`, { error: freeErr });
        }
      } else {
        logger.warn(`[AIClient] FREE tier pool exhausted for JSON ${routeId}, attempting Local Ollama fallback`, {
          exhaustionReason: lastAcquisition.exhaustionReason,
          retryAfterSeconds: lastAcquisition.retryAfterSeconds,
        });
      }

      // 2. Fallback to Local Ollama
      try {
        return (await executeWithOllama("json", prompt, systemPrompt)) as T;
      } catch (ollamaErr) {
        logger.error(`[AIClient] Local Ollama fallback failed for JSON ${routeId}`, { error: ollamaErr });
      }
    }

    // 3. Fallback Exhaustion
    logger.error(`[AIClient] Fallback exhaustion for JSON route ${routeId} (isWorker: ${route.isWorker})`);
    if (route.isWorker) {
      const exhaustionReason = lastAcquisition?.exhaustionReason ?? "MINUTE_QUOTA";
      const retryAfterSeconds =
        lastAcquisition?.retryAfterSeconds ??
        (exhaustionReason === "MINUTE_QUOTA" ? 60 : null);
      throw new AIWorkerBackoffError(undefined, exhaustionReason, retryAfterSeconds);
    } else {
      throw new AIServiceUnavailableError();
    }
  } finally {
    if (!route.isWorker) {
      activeUserRequests = Math.max(0, activeUserRequests - 1);
    }
  }
}
