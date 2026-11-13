import { logger } from "../logging/logger";

export type AIRouteId =
  | "cv.parse.basicData"
  | "cv.parse.experiences"
  | "cv.parse.projects"
  | "cv.parse.education"
  | "cv.parse.skills"
  | "jobs.classification"
  | "jobs.deepAnalysis"
  | "profile.summaryGenerate"
  | "profile.bulletReviewAll"
  | "profile.bulletImprove"
  | "profile.bulletGenerate"
  | "profile.summaryAI"
  | "profile.syncFacts"
  | "profile.skillAlias"
  | "profile.projectSuggest"
  | "profile.skillsSuggest";

export type ChatCapability =
  | "parsing"
  | "summaries"
  | "default"
  | "profile"
  | "skillAlias";

export type AIRouteOrCapability = AIRouteId | ChatCapability;

export type PoolExhaustionReason =
  | "MINUTE_QUOTA"
  | "DAILY_QUOTA"
  | "ALL_MODELS_BLOCKED"
  | "NO_MODELS"
  | "ALL_MODELS_UNAVAILABLE";

export type LiteLLMModelAlias = "chat-free" | "local-only";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

const DEFAULT_LITELLM_BASE_URL = "http://127.0.0.1:4000/v1";
const DEFAULT_LITELLM_TIMEOUT_MS = 60_000;
const SANITIZED_UNAVAILABLE_MESSAGE =
  "AI service temporarily unavailable. Please try again later.";

const WORKER_ROUTES: ReadonlySet<AIRouteId> = new Set<AIRouteId>([
  "jobs.classification",
  "profile.syncFacts",
  "profile.skillAlias",
]);

export class AIServiceUnavailableError extends Error {
  public status: number = 503;

  constructor(message = SANITIZED_UNAVAILABLE_MESSAGE) {
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

function getLocalRoutesSet(): Set<string> {
  const raw = process.env.LITELLM_LOCAL_ROUTES || "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function resolveModelAlias(routeId: AIRouteId): LiteLLMModelAlias {
  return getLocalRoutesSet().has(routeId) ? "local-only" : "chat-free";
}

function getLiteLLMBaseUrl(): string {
  const raw = process.env.LITELLM_BASE_URL?.trim() || DEFAULT_LITELLM_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function getLiteLLMTimeoutMs(): number {
  const parsed = Number(process.env.LITELLM_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LITELLM_TIMEOUT_MS;
}

function throwGatewayUnavailable(
  isWorker: boolean,
  reason: PoolExhaustionReason = "ALL_MODELS_UNAVAILABLE",
  retryAfterSeconds: number | null = null,
): never {
  if (isWorker) {
    throw new AIWorkerBackoffError(undefined, reason, retryAfterSeconds);
  }
  throw new AIServiceUnavailableError(SANITIZED_UNAVAILABLE_MESSAGE);
}

function parseRetryAfterSeconds(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null;
  const parsed = Number(headerValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.ceil(parsed);
  }
  return null;
}

function stripMarkdownFences(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Legacy compatibility resolver (preserved for 768d embeddings until APC-45).
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

async function callLiteLLM(
  routeId: AIRouteId,
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const modelAlias = resolveModelAlias(routeId);
  const isWorker = WORKER_ROUTES.has(routeId);
  const apiKey = process.env.LITELLM_API_KEY?.trim();

  if (!apiKey) {
    logger.error("[AIClient] LITELLM_API_KEY is not configured", {
      routeId,
      modelAlias,
      isWorker,
    });
    throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
  }

  const baseUrl = getLiteLLMBaseUrl();
  const timeoutMs = getLiteLLMTimeoutMs();

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  logger.info("[AIClient] Dispatching LiteLLM request", {
    routeId,
    modelAlias,
    isWorker,
  });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelAlias,
        messages,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      logger.error("[AIClient] LiteLLM gateway returned error status", {
        routeId,
        modelAlias,
        statusCode,
        isWorker,
      });

      if (statusCode === 429) {
        const retryAfterSeconds =
          parseRetryAfterSeconds(response.headers?.get?.("retry-after")) ?? 60;
        throwGatewayUnavailable(isWorker, "MINUTE_QUOTA", retryAfterSeconds);
      }

      throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error) {
      logger.error("[AIClient] LiteLLM response contained error payload", {
        routeId,
        modelAlias,
        isWorker,
        errorCode: data.error.code ?? null,
      });
      throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
    }

    return data.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    if (
      error instanceof AIWorkerBackoffError ||
      error instanceof AIServiceUnavailableError
    ) {
      throw error;
    }

    logger.error("[AIClient] LiteLLM gateway request failed", {
      routeId,
      modelAlias,
      isWorker,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
  }
}

/**
 * Central dispatcher for text generation requests routed through LiteLLM.
 */
export async function generateText(
  prompt: string,
  routeOrCap: AIRouteOrCapability = "default",
  systemPrompt?: string,
): Promise<string> {
  const routeId = normalizeToRouteId(routeOrCap);
  return await callLiteLLM(routeId, prompt, systemPrompt);
}

/**
 * Central dispatcher for structured JSON generation requests routed through LiteLLM.
 */
export async function generateJSON<T>(
  prompt: string,
  routeOrCap: AIRouteOrCapability = "default",
  systemPrompt?: string,
): Promise<T> {
  const routeId = normalizeToRouteId(routeOrCap);
  const jsonSystemPrompt = systemPrompt
    ? `${systemPrompt}\nReturn ONLY valid JSON. Do not include markdown wraps or extra commentary.`
    : "Return ONLY valid JSON. Do not include markdown wraps or extra commentary.";

  const responseText = await callLiteLLM(routeId, prompt, jsonSystemPrompt);
  const cleanedText = stripMarkdownFences(responseText);

  try {
    return JSON.parse(cleanedText) as T;
  } catch (error) {
    logger.error("[AIClient] Failed to parse JSON from LiteLLM response", {
      routeId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}
