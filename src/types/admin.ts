/** `gemma-26b`/`gemma-31b` route through the same Gemini API client as `gemini` (shared
 * `GEMINI_API_KEY`), just with a fixed, non-swappable model id — see aiClient.ts. Gemma has no
 * embedding endpoint, so it is not offered on `EmbeddingProvider` below (same reasoning as
 * Claude's exclusion there). */
export type LLMProvider =
  | "ollama"
  | "gemini"
  | "claude"
  | "gemma-26b"
  | "gemma-31b";

/** Claude has no embedding API — narrower than LLMProvider (ollama/gemini only). */
export type EmbeddingProvider = "ollama" | "gemini";

export interface LLMProviderConfig {
  defaultProvider: LLMProvider;
  parsingProvider: LLMProvider;
  summariesProvider: LLMProvider;
  profileProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
}

export interface CredentialStatus {
  ollama: boolean; // true if OLLAMA_BASE_URL is configured
  gemini: boolean; // true if GEMINI_API_KEY is set and not a placeholder
  claude: boolean; // true if CLAUDE_API_KEY is set and non-empty
}

export interface LLMConfigResponse {
  config: LLMProviderConfig;
  credentialStatus: CredentialStatus;
}

export interface LLMConfigUpdateRequest {
  defaultProvider: LLMProvider;
  parsingProvider: LLMProvider;
  summariesProvider: LLMProvider;
  profileProvider: LLMProvider;
  embeddingProvider: EmbeddingProvider;
}
