# Tasks: Admin LLM Model Configuration Panel

**Input**: Design documents from `specs/005-admin-llm-settings/`  
**Prerequisites**: [plan.md](plan.md) ✅ | [spec.md](spec.md) ✅ | [research.md](research.md) ✅ | [data-model.md](data-model.md) ✅ | [contracts/api-contracts.md](contracts/api-contracts.md) ✅

**Branch**: `005-admin-llm-settings`  
**Last Updated**: 2026-06-15

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US1]**: Admin Configures LLM Providers
- **[US2]**: Admin Sees Provider Requirements & Credential Status

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create TypeScript types and Zod validation schema that all other tasks depend on.

- [x] T001 Create `LLMProvider`, `LLMProviderConfig`, `CredentialStatus`, `LLMConfigResponse`, and `LLMConfigUpdateRequest` TypeScript types in `frontend/src/types/admin.ts`
- [x] T002 Create Zod validation schema `llmConfigSchema` (validates `defaultProvider`, `parsingProvider`, `summariesProvider` as `ollama | gemini | claude` union) in `frontend/src/lib/validation/adminSchemas.ts`

**Checkpoint**: Types and validation schema exist — all downstream tasks can use them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side API route that reads/writes `SystemConfig` and detects credential status. Required before any UI can function.

**⚠️ CRITICAL**: Both user stories depend on this API route.

- [x] T003 Implement `GET /api/admin/llm-config` handler: authenticate session, check `role === "ADMIN"` (return 403 if not), read `AI_PROVIDER_DEFAULT`, `AI_PROVIDER_PARSING`, `AI_PROVIDER_SUMMARIES` from `SystemConfig` via Prisma, compute `credentialStatus` from env vars using the logic in `data-model.md`, return `LLMConfigResponse` JSON in `frontend/src/app/api/admin/llm-config/route.ts`
- [x] T004 Implement `POST /api/admin/llm-config` handler in the same `route.ts` file: authenticate + ADMIN check, parse body, validate with `llmConfigSchema` (return 400 on failure), upsert all three `SystemConfig` keys via `prisma.systemConfig.upsert()`, log the write with Winston at INFO level, return 200 with updated values
- [x] T005 [P] Write integration tests covering: GET returns 401 for unauthenticated, GET returns 403 for USER role, GET returns current config with credentialStatus for ADMIN, POST 400 on invalid provider value, POST 200 updates config correctly in `frontend/tests/integration/llm-config.test.ts`

**Checkpoint**: `GET /api/admin/llm-config` and `POST /api/admin/llm-config` work end-to-end — both returning and accepting `LLMProvider` values with proper auth guard.

---

## Phase 3: User Story 1 — Admin Configures LLM Providers (Priority: P1) 🎯 MVP

**Goal**: ADMIN user can open Settings, see the "LLM Models" collapsed section, expand it, see three provider dropdowns pre-populated with current values, change a provider, click Save, and have the change take effect on the next AI call.

**Independent Test**: Log in as ADMIN → navigate to `/settings` → expand "LLM Models" → change Parsing to `gemini` → Save → upload a CV → confirm server logs show `Routing AI JSON request: parsing -> gemini`.

### Implementation for User Story 1

- [x] T006 [US1] Create `LLMSettingsPanel` client component: receives `config: LLMProviderConfig` and `credentialStatus: CredentialStatus` as props, renders Ant Design `<Collapse defaultActiveKey={[]}>` with a single panel titled "LLM Models", inside the panel renders an Ant Design `<Form>` with three `<Form.Item>` fields ("Default Provider", "Parsing Provider", "Summaries Provider") each containing a `<Select>` with options `ollama`, `gemini`, `claude`, and a "Save" `<Button type="primary">`. Handles form submit by calling `POST /api/admin/llm-config` via `fetch`, shows Ant Design `message.success()` on success or `message.error()` on failure in `frontend/src/components/settings/LLMSettingsPanel.tsx`
- [x] T007 [P] [US1] Create Settings page server component: check `session.user.role === "ADMIN"` (redirect to `/dashboard` if not), call `GET /api/admin/llm-config` server-side to fetch initial config, render `<LLMSettingsPanel config={...} credentialStatus={...} />` with a page title "Administration Settings" in `frontend/src/app/(main)/settings/page.tsx`
- [x] T008 [P] [US1] Write unit test: mock `fetch` to return a preset config, render `<LLMSettingsPanel>`, verify all three `<Select>` show correct pre-loaded values, simulate changing "Parsing" to "gemini" and clicking Save, verify `POST /api/admin/llm-config` was called with correct body in `frontend/tests/unit/admin-config.test.tsx`

**Checkpoint**: ADMIN user can fully configure all three LLM providers via UI. Non-admin visiting `/settings` is redirected. Changes take effect immediately on next AI call.

---

## Phase 4: User Story 2 — Credential Status Indicators (Priority: P2)

**Goal**: Each provider option in the dropdown shows a visual status badge (✓ Configured / ⚠️ API key not set / ❌ Not configured) so the admin knows which providers are ready to use.

**Independent Test**: With `GEMINI_API_KEY` set to placeholder and `CLAUDE_API_KEY` absent, open Settings → "LLM Models" → Ollama shows "✓ Configured", Gemini shows "⚠️ API key not set", Claude shows "❌ Not configured". After setting a real `GEMINI_API_KEY`, reload page → Gemini shows "✓ Configured".

### Implementation for User Story 2

- [x] T009 [US2] Update `LLMSettingsPanel` to decorate each `<Select.Option>` label with the credential status received via `credentialStatus` prop: Ollama → green `✓ Configured` if `credentialStatus.ollama` is true, Gemini → amber `⚠️ API key not set` if false, Claude → red `❌ Not configured` if false. Use Ant Design `<Tag>` or inline colored `<span>` for the badge. Add an info tooltip (Ant Design `<Tooltip>`) on each option that lists the required environment variable(s) per the contract in `research.md` in `frontend/src/components/settings/LLMSettingsPanel.tsx`
- [x] T010 [P] [US2] Update unit test to assert badge text renders correctly for each credential status combination (all true / gemini false / claude false / all false) in `frontend/tests/unit/admin-config.test.tsx`

**Checkpoint**: Provider status indicators are accurate and informative. All user stories functionally complete.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, OpenAPI update, and env reminder for the user.

- [x] T011 [P] Update `frontend/public/openapi.yaml` to document the two new routes: `GET /api/admin/llm-config` and `POST /api/admin/llm-config` including request/response schemas from `contracts/api-contracts.md`
- [x] T012 Add `.env.local` entry comment for `CLAUDE_API_KEY` to the existing `.env` file and update the `README` or `quickstart.md` with a note: "To activate Gemini: replace `GEMINI_API_KEY` placeholder. To activate Claude: add `CLAUDE_API_KEY=sk-ant-...` to `.env.local`"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (needs types + Zod schema from T001–T002)
- **Phase 3 (US1)**: Depends on Phase 2 (needs working API route from T003–T004)
- **Phase 4 (US2)**: Depends on Phase 3 (extends `LLMSettingsPanel` from T006)
- **Phase 5 (Polish)**: Depends on Phase 4 completion

### Task Dependencies Within Phases

```
T001 ──► T002 ──► T003 ──► T006 ──► T009
                  │         │
                  T004       T007
                  │
                  T005 (parallel — integration tests)
                  T008 (parallel — unit tests)
                  T010 (parallel — extends T008)
```

### Parallel Opportunities

```bash
# Phase 1 — sequential (T002 needs T001 types):
T001 → T002

# Phase 2 — T005 can run in parallel with T003+T004:
T003 + T004 (sequential, same file)
T005 (parallel test file)

# Phase 3 — T007 and T008 parallel with T006:
T006 (component)
T007 (page — can scaffold while T006 is being built)
T008 (unit test — can write while T006 is being built)

# Phase 4:
T009 (extends T006 component)
T010 (parallel test update)

# Phase 5:
T011 + T012 (fully parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — ~2-3h)

1. Complete **Phase 1**: T001 → T002 (types + schema)
2. Complete **Phase 2**: T003 → T004 (API route) + T005 (integration tests)
3. Complete **Phase 3**: T006 → T007 → T008 (UI + page + unit test)
4. **STOP and VALIDATE**: Log in as `wtaiatella@gmail.com` → Settings visible → configure provider → confirm change in next AI call
5. ✅ MVP delivered — admin can manage LLM providers

### Incremental Delivery

1. **MVP (US1)**: Provider selection fully works
2. **+ US2**: Add credential status badges → admin knows which providers are ready
3. **+ Polish**: OpenAPI docs + env setup notes

---

## Summary

| Phase | Tasks | Story | Estimated effort |
|-------|-------|-------|-----------------|
| Phase 1: Setup | T001–T002 | — | ~30min |
| Phase 2: Foundational | T003–T005 | — | ~1h |
| Phase 3: US1 (MVP) | T006–T008 | US1 | ~1.5h |
| Phase 4: US2 | T009–T010 | US2 | ~45min |
| Phase 5: Polish | T011–T012 | — | ~20min |
| **Total** | **12 tasks** | | **~4h** |

- **Parallel opportunities**: T005/T007/T008 (Phase 2/3), T011/T012 (Phase 5)
- **MVP scope**: Phases 1–3 (T001–T008)
- **Suggested first task**: T001 — `frontend/src/types/admin.ts`
