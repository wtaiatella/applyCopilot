import {
  AIServiceUnavailableError,
  AIWorkerBackoffError,
  getLiteLLMBaseUrl,
  getLiteLLMTimeoutMs,
  throwGatewayUnavailable,
} from "./aiClient";
import { logger } from "../logging/logger";

const EMBEDDING_MODEL_ALIAS = "embedding-local";

/**
 * Fixed dimension for every embedding vector produced by this service
 * (LiteLLM `embedding-local` -> Ollama `qwen3-embedding:0.6b`, 1024d).
 * `UserProfile.embedding`, `JobListing.embedding`, and `SkillEmbedding.embedding`
 * columns are `vector(1024)`.
 */
export const EMBEDDING_DIMENSION = 1024;

export interface GenerateEmbeddingOptions {
  isWorker?: boolean;
}

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

function parseRetryAfterSeconds(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null;
  const parsed = Number(headerValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.ceil(parsed);
  }
  return null;
}

/**
 * Generates a fixed-dimension (1024d) vector embedding for a given text via the
 * centralized LiteLLM gateway (`POST ${LITELLM_BASE_URL}/embeddings`, model `embedding-local`)
 * with strict no-fallback behavior.
 *
 * @param text The input string to vectorize.
 * @param options Optional settings (`isWorker` switches unavailability error to `AIWorkerBackoffError`).
 * @returns Promise<number[]> Resolves to an array of `EMBEDDING_DIMENSION` numbers.
 */
export async function generateEmbedding(
  text: string,
  options?: GenerateEmbeddingOptions,
): Promise<number[]> {
  const isWorker = options?.isWorker ?? false;
  const trimmedText = text.trim();
  if (!trimmedText) {
    logger.warn(
      "Attempted to generate embedding for empty string. Returning zero-filled vector.",
    );
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  const apiKey = process.env.LITELLM_API_KEY?.trim();
  if (!apiKey) {
    logger.error("[VectorService] LITELLM_API_KEY is not configured", {
      modelAlias: EMBEDDING_MODEL_ALIAS,
      isWorker,
    });
    throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
  }

  const baseUrl = getLiteLLMBaseUrl();
  const timeoutMs = getLiteLLMTimeoutMs();

  logger.info("[VectorService] Dispatching LiteLLM embedding request", {
    modelAlias: EMBEDDING_MODEL_ALIAS,
    isWorker,
  });

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL_ALIAS,
        input: trimmedText,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const statusCode = response.status;
      logger.error("[VectorService] LiteLLM embedding gateway returned error status", {
        modelAlias: EMBEDDING_MODEL_ALIAS,
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

    const payload = (await response.json()) as EmbeddingResponse;
    if (payload.error) {
      logger.error("[VectorService] LiteLLM embedding response contained error payload", {
        modelAlias: EMBEDDING_MODEL_ALIAS,
        isWorker,
        errorCode: payload.error.code ?? null,
      });
      throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
    }

    const vector = payload.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) {
      logger.error("[VectorService] Invalid or mismatched embedding dimension", {
        modelAlias: EMBEDDING_MODEL_ALIAS,
        expectedDimension: EMBEDDING_DIMENSION,
        receivedDimension: Array.isArray(vector) ? vector.length : null,
        isWorker,
      });
      throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
    }

    return vector;
  } catch (error) {
    if (
      error instanceof AIWorkerBackoffError ||
      error instanceof AIServiceUnavailableError
    ) {
      throw error;
    }

    logger.error("[VectorService] Failed to generate vector embedding via LiteLLM", {
      modelAlias: EMBEDDING_MODEL_ALIAS,
      isWorker,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throwGatewayUnavailable(isWorker, "ALL_MODELS_UNAVAILABLE", null);
  }
}
