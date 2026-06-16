# Research: Admin LLM Model Configuration Panel

**Feature**: `005-admin-llm-settings`  
**Date**: 2026-06-15  
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## Decision Log

### D-001: No new Prisma migration required

- **Decision**: Use existing `SystemConfig` table as-is
- **Rationale**: The table exists with the exact keys the UI needs (`AI_PROVIDER_DEFAULT`, `AI_PROVIDER_PARSING`, `AI_PROVIDER_SUMMARIES`). Adding a migration would be unnecessary complexity.
- **Alternatives considered**: Adding a dedicated `AdminSettings` table → rejected (over-engineering for a key-value config store)

### D-002: Model name editing is out of scope for Phase 1

- **Decision**: UI only exposes provider selection; model name keys (`OLLAMA_MODEL`, `GEMINI_MODEL`, `CLAUDE_MODEL`) are read-only and managed via environment variables
- **Rationale**: Model naming is a technical concern better managed via env vars. Provider selection is the high-value admin decision. Keeps scope minimal and deliverable.
- **Alternatives considered**: Free-text inputs for model names → deferred to Phase 2 if needed

### D-003: Credential status checked server-side via env var inspection

- **Decision**: The GET `/api/admin/llm-config` route checks `process.env.*` values and returns a `credentialStatus` object to the client
- **Rationale**: Environment variables are only available server-side in Next.js. The client cannot read them directly. Returning pre-computed status avoids leaking keys to the browser.
- **Alternatives considered**: Exposing env var names only → rejected (less useful UX; admin can't tell if key is actually set)

### D-004: Ant Design Collapse with initial state collapsed

- **Decision**: `<Collapse defaultActiveKey={[]}>` — all panels closed by default (spec FR-011)
- **Rationale**: Admin settings should be intentional — collapsing by default prevents accidental changes and is standard UX for settings panels
- **Alternatives considered**: Open by default → rejected (spec explicitly requires collapsed)

### D-005: Claude API via raw fetch (no SDK) — correct as-is

- **Decision**: Keep existing raw `fetch` to `https://api.anthropic.com/v1/messages` in `aiClient.ts`
- **Rationale**: Implementation is correct and avoids adding the `@anthropic-ai/sdk` dependency. The `anthropic-version: 2023-06-01` header is the stable API version.
- **Note**: Current `max_tokens: 2048` may be insufficient for complex CV parsing. Recommendation: increase to 4096 in a follow-up fix.
- **Alternatives considered**: Install `@anthropic-ai/sdk` → not needed; raw fetch is sufficient

### D-006: Session role freshness — sign-out required

- **Decision**: Document that users logged in before the role change need to sign out/sign in
- **Rationale**: NextAuth JWT tokens are signed at login time. The role in the token doesn't update mid-session.
- **Alternatives considered**: Force session invalidation via DB → over-engineering for a one-time admin promotion

---

## Provider API Key Reference

### Gemini (Google AI)

- **Package**: `@google/genai` (already installed as `@google/genai`)
- **Auth**: `GEMINI_API_KEY` → passed to `new GoogleGenAI({ apiKey })`
- **Get key**: https://aistudio.google.com/app/apikey
- **Current status**: `GEMINI_API_KEY` is set to `"your-gemini-api-key-here"` (placeholder) — **must be replaced**
- **Default model**: `gemini-1.5-flash` (fast, cost-effective; also available: `gemini-1.5-pro`, `gemini-2.0-flash`)
- **No additional setup needed** beyond API key

### Claude (Anthropic)

- **Implementation**: Raw HTTP POST to `https://api.anthropic.com/v1/messages`
- **Auth**: `x-api-key: CLAUDE_API_KEY` header
- **Get key**: https://console.anthropic.com/settings/keys
- **Current status**: `CLAUDE_API_KEY` is **not defined** in `.env` — **must be added**
- **Default model**: `claude-3-5-sonnet-latest` (high capability; also available: `claude-3-haiku-20240307` for speed/cost)
- **anthropic-version header**: `2023-06-01` — this is correct and stable
- **Required `.env` addition**:
  ```env
  CLAUDE_API_KEY="sk-ant-..."
  ```

### Ollama (Local)

- **Package**: `ollama` npm package (already installed)
- **Auth**: None required
- **Setup**: Ollama service must be running at `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- **Current status**: ✅ Configured and working (`granite4.1:8b`)
- **Other models available**: `llama3.2`, `mistral`, `phi3`, `qwen2.5-coder` — must be pulled first with `ollama pull <model>`

---

## Env Vars Summary (for user reference)

```env
# .env — current state

# ✅ Working:
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="granite4.1:8b"
CLAUDE_MODEL="claude-3-5-sonnet-latest"
GEMINI_MODEL="gemini-1.5-flash"

# ⚠️ Needs real value (currently placeholder):
GEMINI_API_KEY="your-gemini-api-key-here"   # → Replace with real Google AI Studio key

# ❌ Missing — must add to activate Claude:
# CLAUDE_API_KEY="sk-ant-..."               # → Add to .env.local or .env
```
