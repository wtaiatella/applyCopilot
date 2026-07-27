export type LLMProvider = 'ollama' | 'gemini' | 'claude';

export interface LLMProviderConfig {
  defaultProvider: LLMProvider;
  parsingProvider: LLMProvider;
  summariesProvider: LLMProvider;
}

export interface CredentialStatus {
  ollama: boolean;   // true if OLLAMA_BASE_URL is configured
  gemini: boolean;   // true if GEMINI_API_KEY is set and not a placeholder
  claude: boolean;   // true if CLAUDE_API_KEY is set and non-empty
}

export interface LLMConfigResponse {
  config: LLMProviderConfig;
  credentialStatus: CredentialStatus;
}

export interface LLMConfigUpdateRequest {
  defaultProvider: LLMProvider;
  parsingProvider: LLMProvider;
  summariesProvider: LLMProvider;
}
