# Implementation Plan: Admin LLM Model Configuration Panel

**Branch**: `005-admin-llm-settings` | **Date**: 2026-06-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/005-admin-llm-settings/spec.md`

---

## Summary

This feature adds a Settings admin panel (`/settings`) to ApplyCopilot that allows ADMIN users to configure which LLM provider (Ollama, Gemini, Claude) is active for each AI capability (Default, Parsing, Summaries) — without touching environment files or restarting the server.

The implementation requires:
1. **Promoting `wtaiatella@gmail.com` to ADMIN** — done via direct DB update (completed)
2. **Settings page** under the existing `(main)` route group, guarded by role check
3. **Admin API route** `GET/POST /api/admin/llm-config` for reading and writing `SystemConfig` keys
4. **UI component** `LLMSettingsPanel` with Ant Design Collapse + Select dropdowns + credential status indicator

The sidebar already conditionally shows "Settings" for ADMIN users (lines 88–95 in `MainLayoutClient.tsx`). The `SystemConfig` table already exists and is already consumed by `aiClient.ts`. No Prisma schema changes are required.

---

## Technical Context

**Language/Version**: TypeScript 5.x / Next.js 16 (App Router, Turbopack)  
**Primary Dependencies**: Ant Design 6, Tailwind CSS 4, Prisma 7.x (PostgreSQL), NextAuth v5, Lucide React  
**Storage**: PostgreSQL — `SystemConfig` table (key-value store, already seeded with 6 AI config keys)  
**Testing**: Jest (unit) + Jest integration tests (API routes)  
**Target Platform**: Web (Next.js server + client)  
**Project Type**: Web application — full-stack Next.js  
**Performance Goals**: Settings page load < 2s; config write takes effect immediately on next AI call (< 500ms propagation)  
**Constraints**: No server restart required after config change; no new Prisma schema migrations needed; ADMIN-only access enforced server-side  
**Scale/Scope**: Single admin page with one collapsible section (US1) + credential status display (US2)

---

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| Spec-Driven (I) | ✅ PASS | `spec.md` exists and is complete; no implementation starts without it |
| Trunk-Based Dev (II) | ✅ PASS | Feature branch `005-admin-llm-settings` — short-lived |
| Pragmatic Testing (III) | ✅ PASS | Unit + integration tests for API route required at PR delivery |
| English-Only (IV) | ✅ PASS | All artifacts in English |
| AI Cost Optimization (V) | ✅ PASS | Feature enables admin control over provider tier; defaults to Ollama |
| Privacy by Default (VI) | ✅ PASS | No user data exposed; admin-only config read/write |
| UI Consistency (VII) | ✅ PASS | Ant Design `Collapse` + `Select` + `Form`; Tailwind for spacing only |
| Logging & Auditing (VIII) | ✅ PASS | API route uses Winston logger for all write operations |

---

## Project Structure

### Documentation (this feature)

```text
specs/005-admin-llm-settings/
├── plan.md              # This file
├── research.md          # Phase 0 — LLM provider API findings
├── data-model.md        # Phase 1 — SystemConfig key reference
├── contracts/
│   └── api-contracts.md # Phase 1 — /api/admin/llm-config contract
└── tasks.md             # Phase 2 output — /speckit-tasks command
```

### Source Code

```text
frontend/
├── src/
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── settings/
│   │   │   │   └── page.tsx           # [NEW] Settings page (ADMIN only)
│   │   └── api/
│   │       └── admin/
│   │           └── llm-config/
│   │               └── route.ts       # [NEW] GET + POST /api/admin/llm-config
│   ├── components/
│   │   └── settings/
│   │       └── LLMSettingsPanel.tsx   # [NEW] Collapsible LLM config form
│   └── types/
│       └── admin.ts                   # [NEW] AdminConfig DTO types
└── tests/
    ├── unit/
    │   └── admin-config.test.ts       # [NEW] Unit tests for config resolution
    └── integration/
        └── llm-config.test.ts         # [NEW] Integration tests for API route
```

**Structure Decision**: Standard Next.js App Router structure — settings page under `(main)` route group, API route under `api/admin/`, shared component in `components/settings/`.

---

## Phase 0: Research Findings

### R-001: SystemConfig Keys (confirmed from DB)

Current DB state (confirmed):

| Key | Current Value |
|-----|--------------|
| `AI_PROVIDER_DEFAULT` | `ollama` |
| `AI_PROVIDER_PARSING` | `ollama` |
| `AI_PROVIDER_SUMMARIES` | `gemini` |
| `OLLAMA_MODEL` | `granite4.1:8b` |
| `GEMINI_MODEL` | `gemini-1.5-flash` |
| `CLAUDE_MODEL` | `claude-3-5-sonnet-latest` |

The UI reads and writes exactly these 3 provider keys: `AI_PROVIDER_DEFAULT`, `AI_PROVIDER_PARSING`, `AI_PROVIDER_SUMMARIES`.

### R-002: aiClient.ts — Provider Key Mapping (confirmed)

`resolveAIConfig()` reads from DB first, then falls back to env vars. Config changes to `SystemConfig` take effect immediately on the next AI call (no caching). No changes to `aiClient.ts` required.

### R-003: Provider Credential Requirements

| Provider | Required Env Var(s) | How to Obtain | Status in current .env |
|----------|---------------------|---------------|----------------------|
| **Ollama** | `OLLAMA_BASE_URL` (default: `http://localhost:11434`) | Run Ollama locally | ✅ Configured |
| **Gemini** | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API Key | ⚠️ Placeholder value (`"your-gemini-api-key-here"`) |
| **Claude** | `CLAUDE_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) → API Keys | ❌ Not defined in .env |

**Gemini SDK**: Uses `@google/genai` package (already installed). Auth via `GEMINI_API_KEY`. The current placeholder `"your-gemini-api-key-here"` will fail — must be replaced with a real key.

**Claude API**: Uses raw HTTP `fetch` to `https://api.anthropic.com/v1/messages`. Auth via `x-api-key: CLAUDE_API_KEY` header. Uses `anthropic-version: 2023-06-01` which is current. No `@anthropic-ai/sdk` installed — raw fetch implementation in `aiClient.ts` is correct. Max tokens set to 2048 — may need increase for long CV parsing (recommended: 4096).

**Ollama**: Uses `ollama` npm package (already installed). No auth required. Requires Ollama service running at `OLLAMA_BASE_URL`.

### R-004: Credential Detection Strategy

The UI displays a status indicator per provider. Detection logic (server-side API call):
- **Ollama**: Check `OLLAMA_BASE_URL` is set and not empty → ✅ configured (always available locally)
- **Gemini**: Check `GEMINI_API_KEY` is set, non-empty, and does NOT equal `"your-gemini-api-key-here"` → ✅ if real key
- **Claude**: Check `CLAUDE_API_KEY` is set and non-empty → ✅ if present

### R-005: ADMIN Role — User & Session

- `User.role` enum exists in Prisma schema with `USER` and `ADMIN` variants ✅
- `session.user.role` is available in NextAuth session (confirmed from `MainLayoutClient.tsx` usage at line 27 + 89)
- `wtaiatella@gmail.com` promoted to `ADMIN` in DB (done: SQL UPDATE confirmed)
- The session will reflect the new role on next sign-in; if user is already logged in, a sign-out + sign-in is required to get the updated JWT role claim

### R-006: Sidebar — Settings Link (already implemented)

`MainLayoutClient.tsx` lines 88–95 already add the Settings menu item for `user.role === "ADMIN"`. The `/settings` route just needs to be created.

---

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](data-model.md).

### API Contract

See [contracts/api-contracts.md](contracts/api-contracts.md).

### Component Architecture

```
(main)/settings/page.tsx
  └── <SettingsPage>          (Server Component — checks ADMIN role, fetches initial config)
        └── <LLMSettingsPanel config={initialConfig} credentialStatus={status} />
              └── <Collapse>  (Ant Design — single panel "LLM Models", initially collapsed)
                    └── <Form>
                          ├── <Form.Item label="Default Provider">  <Select />
                          ├── <Form.Item label="Parsing Provider">  <Select />
                          └── <Form.Item label="Summaries Provider"> <Select />
                              [Save button → POST /api/admin/llm-config]
```

Provider `<Select>` options per dropdown:
```
{ value: 'ollama',  label: 'Ollama (Local)  ✓ Configured' }
{ value: 'gemini',  label: 'Gemini  ⚠️ API key not set' }
{ value: 'claude',  label: 'Claude  ❌ Not configured' }
```

Status decoration is computed server-side (in the API GET response) and passed to the client component as `credentialStatus: { ollama: boolean, gemini: boolean, claude: boolean }`.

### ENV Variables Required

```env
# Already in .env (configured):
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="granite4.1:8b"
GEMINI_MODEL="gemini-1.5-flash"
CLAUDE_MODEL="claude-3-5-sonnet-latest"

# Needs real value (currently placeholder):
GEMINI_API_KEY="<YOUR_GOOGLE_AI_STUDIO_KEY>"

# Not yet defined — add to .env.local or .env:
CLAUDE_API_KEY="<YOUR_ANTHROPIC_KEY>"
```

---

## Implementation Notes

### Security: Admin Route Guard

The `/api/admin/llm-config` route MUST check `session.user.role === "ADMIN"` server-side. Non-admin requests return `403 Forbidden`. The settings page (`/settings/page.tsx`) MUST also check the role server-side and redirect non-admins to `/dashboard`.

### Session Role Freshness

The role is embedded in the JWT session token at login time. If `wtaiatella@gmail.com` was already logged in when the `role` was updated to `ADMIN`, they must log out and back in for the sidebar Settings link to appear. This is a known NextAuth JWT behavior — document this for the user.

### Ant Design Collapse — Initial State

Use `defaultActiveKey={[]}` (empty) so all sections start collapsed per spec FR-011.

### No Prisma Migration Needed

`SystemConfig` table already exists. The feature only reads/writes existing rows — no new columns or tables.

---

## Verification Plan

### Automated Tests

```bash
# Unit tests
npx jest tests/unit/admin-config.test.ts --no-coverage

# Integration tests (requires running DB)
npx jest tests/integration/llm-config.test.ts --no-coverage

# Full test suite
npx jest --no-coverage
```

### Manual Verification

1. Log in as `wtaiatella@gmail.com` → Settings appears in sidebar ✅
2. Log in as `test-user-login-mcp@example.com` → Settings NOT in sidebar ✅
3. Navigate directly to `/settings` as non-admin → Redirected to `/dashboard` ✅
4. Open Settings → "LLM Models" section visible, collapsed by default ✅
5. Expand section → three dropdowns with current values pre-loaded ✅
6. Change Parsing to Gemini → Save → Upload CV → verify Gemini is called in server logs ✅
7. Provider status indicators show correct state for each provider ✅
