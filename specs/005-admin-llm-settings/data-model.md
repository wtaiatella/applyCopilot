# Data Model: Admin LLM Configuration

**Feature**: `005-admin-llm-settings`  
**Date**: 2026-06-15

---

## No Schema Changes Required

The `SystemConfig` model already exists in `prisma/schema.prisma`:

```prisma
model SystemConfig {
  key   String @id
  value String
}
```

This is a simple key-value store. No migrations are needed.

---

## Relevant SystemConfig Keys

### AI Provider Selection (provider string: `ollama` | `gemini` | `claude`)

| Key | Purpose | UI Label | Allowed Values |
|-----|---------|----------|---------------|
| `AI_PROVIDER_DEFAULT` | Fallback provider when a capability-specific key is not set | "Default Provider" | `ollama`, `gemini`, `claude` |
| `AI_PROVIDER_PARSING` | Provider used for CV parsing (SSE pipeline) | "Parsing Provider" | `ollama`, `gemini`, `claude` |
| `AI_PROVIDER_SUMMARIES` | Provider used for summary generation | "Summaries Provider" | `ollama`, `gemini`, `claude` |

### Model Selection (read-only in UI Phase 1 — managed via env vars)

| Key | Purpose | Default (env fallback) |
|-----|---------|----------------------|
| `OLLAMA_MODEL` | Model name for Ollama | `granite4.1:8b` |
| `GEMINI_MODEL` | Model name for Gemini | `gemini-1.5-flash` |
| `CLAUDE_MODEL` | Model name for Claude | `claude-3-5-sonnet-latest` |

> **Scope note**: Model name editing is out of scope for Phase 1 UI. The `*_MODEL` keys remain read-only via the API and are not exposed in the settings form.

---

## TypeScript DTOs (`src/types/admin.ts`)

```typescript
// src/types/admin.ts

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
```

---

## Credential Detection Logic

```typescript
// Server-side — computed in GET /api/admin/llm-config

function resolveCredentialStatus(): CredentialStatus {
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  return {
    ollama: !!(ollamaUrl && ollamaUrl.length > 0),
    gemini: !!(
      geminiKey &&
      geminiKey.length > 0 &&
      geminiKey !== 'your-gemini-api-key-here'
    ),
    claude: !!(claudeKey && claudeKey.length > 0),
  };
}
```
