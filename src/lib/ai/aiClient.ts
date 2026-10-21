import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";
import { AIRouteId } from "@/types/ai-manager";
import { acquireNextAvailableFreeModel, ResolvedFreeModel } from "./rotation-cursor";
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
  constructor(message = "All free-tier AI models and local fallbacks are currently exhausted. Worker pausing for 5 minutes.") {
    super(message);
    this.name = "AIWorkerBackoffError";
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

  if (route.preferredTier === "LOCAL") {
    // 1. Try Local Ollama first
    try {
      return (await executeWithOllama("text", prompt, systemPrompt)) as string;
    } catch (ollamaErr) {
      logger.warn(`[AIClient] Local Ollama failed for ${routeId}, attempting FREE tier fallback`, { error: ollamaErr });
      
      // 2. Fallback to FREE tier pool
      const freeModel = await acquireNextAvailableFreeModel();
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
    const freeModel = await acquireNextAvailableFreeModel();
    if (freeModel) {
      try {
        return (await executeWithModel(freeModel, "text", prompt, systemPrompt)) as string;
      } catch (freeErr) {
        logger.warn(`[AIClient] FREE tier model ${freeModel.model.displayName} failed, attempting Local Ollama fallback`, { error: freeErr });
      }
    } else {
      logger.warn(`[AIClient] FREE tier pool exhausted for ${routeId}, attempting Local Ollama fallback`);
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
    throw new AIWorkerBackoffError();
  } else {
    throw new AIServiceUnavailableError();
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

  if (route.preferredTier === "LOCAL") {
    // 1. Try Local Ollama first
    try {
      return (await executeWithOllama("json", prompt, systemPrompt)) as T;
    } catch (ollamaErr) {
      logger.warn(`[AIClient] Local Ollama failed for JSON ${routeId}, attempting FREE tier fallback`, { error: ollamaErr });
      
      // 2. Fallback to FREE tier pool
      const freeModel = await acquireNextAvailableFreeModel();
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
    const freeModel = await acquireNextAvailableFreeModel();
    if (freeModel) {
      try {
        return (await executeWithModel(freeModel, "json", prompt, systemPrompt)) as T;
      } catch (freeErr) {
        logger.warn(`[AIClient] FREE tier model ${freeModel.model.displayName} failed for JSON, attempting Local Ollama fallback`, { error: freeErr });
      }
    } else {
      logger.warn(`[AIClient] FREE tier pool exhausted for JSON ${routeId}, attempting Local Ollama fallback`);
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
    throw new AIWorkerBackoffError();
  } else {
    throw new AIServiceUnavailableError();
  }
}
