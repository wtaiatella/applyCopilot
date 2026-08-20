import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";
import { resolveAIConfig } from "./aiClient";
import { logger } from "../logging/logger";

const googleGenAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

const ollamaClient = new Ollama({
  host: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
});

/**
 * Fixed dimension for every embedding vector produced by this service, regardless of
 * provider (Ollama `nomic-embed-text` is natively 768d; Gemini `gemini-embedding-001` is
 * constrained to 768d via `outputDimensionality`). Both `UserProfile.embedding` and
 * `JobListing.embedding` columns are `vector(768)` — see spectech Data Models.
 */
export const EMBEDDING_DIMENSION = 768;

/**
 * Generates a fixed-dimension (768d) vector embedding for a given text via the configured
 * embedding provider (Ollama or Gemini, resolved by `resolveAIConfig("embedding")`).
 * Claude has no embedding API — if it is ever resolved for the "embedding" capability
 * (e.g. inherited from `AI_PROVIDER_DEFAULT`), this falls back to Ollama.
 *
 * Signature/import path is intentionally unchanged (FR-18) — `cvMatchScoreService.ts`
 * (Spec 007) imports this function directly and must require zero edits.
 *
 * @param text The input string to vectorize.
 * @returns Promise<number[]> Resolves to an array of `EMBEDDING_DIMENSION` decimal numbers.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    logger.warn(
      "Attempted to generate embedding for empty string. Returning zero-filled vector.",
    );
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  try {
    const { provider: resolvedProvider, model } =
      await resolveAIConfig("embedding");
    let provider: "ollama" | "gemini" | "claude" = resolvedProvider;

    if (provider === "claude") {
      logger.warn(
        "Claude has no embedding API; falling back to Ollama for embedding generation.",
        { resolvedModel: model },
      );
      provider = "ollama";
    }

    let vector: number[];

    if (provider === "gemini") {
      const response = await googleGenAI.models.embedContent({
        model,
        contents: trimmedText,
        config: { outputDimensionality: EMBEDDING_DIMENSION },
      });
      vector = response.embeddings?.[0]?.values || [];
    } else {
      const response = await ollamaClient.embed({
        model,
        input: trimmedText,
      });
      vector = response.embeddings?.[0] || [];
    }

    if (vector.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Expected embedding vector of size ${EMBEDDING_DIMENSION}, received ${vector.length}`,
      );
    }

    return vector;
  } catch (error) {
    logger.error("Failed to generate vector embedding via embedding provider", {
      error,
    });
    throw error;
  }
}
