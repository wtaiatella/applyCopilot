# Tasks: Job Classification & Semantic Matching

**Feature**: `004-job-classification`  
**Input**: Design documents from `/specs/004-job-classification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md

**Tests**: Unit and integration tests are required as mandated by the project constitution (minimum 80% coverage).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths are provided in descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependency installation and baseline setup.

- [x] T001 Install TensorFlow.js and Universal Sentence Encoder packages in `frontend/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema changes, local vectorization engine, and testing framework setup.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Update Prisma Schema in `frontend/prisma/schema.prisma` to include `Unsupported("vector(512)")` on `UserProfile` and `JobListing`, add the `ClassificationStatus` & `RecommendationVerdict` enums, and add the `JobAnalysis` model.
- [x] T003 Generate the database migration using `prisma migrate dev --create-only`, manually add `CREATE EXTENSION IF NOT EXISTS vector;` at the top of the generated SQL migration file, and apply it to PostgreSQL.
- [x] T004 Implement the Universal Sentence Encoder singleton model loader in `frontend/src/lib/ai/tensorflow-model.ts` with CPU backend initialization.
- [x] T005 Implement the vector generation service in `frontend/src/lib/ai/vector-service.ts` to convert text strings to 512-dimension vectors.
- [x] T006 Create unit tests for local vector generation in `frontend/tests/unit/vector-service.test.ts`.

**Checkpoint**: Foundation ready — local vectorization and database structure are verified and functional.

---

## Phase 3: User Story 1 — Profile Sync with AI (Priority: P1) 🎯 MVP

**Goal**: Clean and vectorize candidate profile data using the Summaries Provider LLM on-demand.

**Independent Test**: Edit candidate experience, check the status indicator showing "Out of Date", click "Sync with AI", and verify that the database contains the 512-dimension vector in `UserProfile` and the status updates to "Synced".

### Tests for User Story 1
- [x] T007 [P] [US1] Create integration tests for the profile sync endpoint in `frontend/tests/integration/profile-sync.test.ts`.

### Implementation for User Story 1
- [x] T008 [P] [US1] Implement profile text consolidation and LLM summarization logic in `frontend/src/services/profileSyncService.ts` using `AI_PROVIDER_SUMMARIES` from `SystemConfig`.
- [x] T009 [P] [US1] Create API endpoint `POST /api/profile/sync` in `frontend/src/app/api/profile/sync/route.ts` to trigger LLM cleaning, generate a 512-dimension vector via `vector-service.ts`, and update `UserProfile` with `aiCleanedText`, `embedding`, and `embeddingSyncedAt`.
- [x] T010 [US1] Add a manual "Sync with AI" button and sync status indicator (`Synced`, `Out of Date`, `Not Synced` + last sync timestamp) to the Profile page component in `frontend/src/components/profile/ProfileTabs.tsx`. Display an "IA Profile Index Out of Date" warning whenever profile data is auto-saved without re-syncing.

**Checkpoint**: User Story 1 is functional. The user can manually clean and vectorize their profile.

---

## Phase 4: User Story 2 — Job Classification Worker (Priority: P1)

**Goal**: Background worker to clean and vectorize crawled job descriptions with LLM circuit breaker support.

**Independent Test**: Trigger the worker with a noise-heavy raw job listing (set `classificationStatus = PENDING`, `isFullDescriptionFetched = true`), verify it requests LLM cleaning via `AI_PROVIDER_PARSING`, computes the 512-dimension vector, saves `cleanedSummary` and `embedding` to the `JobListing` record, and marks `classificationStatus = COMPLETED`.

### Tests for User Story 2
- [x] T011 [P] [US2] Create unit tests for the Circuit Breaker module in `frontend/tests/unit/circuit-breaker.test.ts` verifying that provider status is set to `BLOCKED` on HTTP 429/401/402 and resets after the cooldown period.
- [x] T012 [P] [US2] Create integration tests for the classification worker in `frontend/tests/integration/classification-worker.test.ts` validating sequential job processing, LLM cleaning, vectorization, and `BLOCKED` provider skip logic.

### Implementation for User Story 2
- [x] T013 [P] [US2] Implement the "Circuit Breaker" error handler in `frontend/src/lib/ai/circuit-breaker.ts` that reads and writes the provider status (`BLOCKED` + cooldown expiry timestamp) in the `SystemConfig` table upon HTTP 429, 401, or 402 errors, and exposes a `isProviderBlocked(providerKey: string): Promise<boolean>` helper.
- [x] T014 [P] [US2] Implement the LLM cleaning and technical summary extraction service in `frontend/src/services/jobClassificationService.ts` — accepts a raw `JobListing`, calls `AI_PROVIDER_PARSING` to extract a structured technical summary (required skills, years of experience, remote status, core technologies), strips corporate noise, and returns the cleaned text string.
- [x] T015 [US2] Create the background queue worker in `frontend/src/lib/workers/classification-worker.ts` that: (1) checks `isProviderBlocked("AI_PROVIDER_PARSING")`; (2) fetches listings with `isFullDescriptionFetched = true` and `classificationStatus = PENDING`; (3) calls `jobClassificationService` per listing; (4) generates the 512-dimension vector via `vector-service.ts`; (5) updates `JobListing` with `cleanedSummary`, `embedding`, and `classificationStatus = COMPLETED`; (6) leaves status as `PENDING` on transient LLM errors.

**Checkpoint**: Background worker classifies newly crawled jobs and handles API rate limits safely.

---

## Phase 5: User Story 3 — Job Panel & Dynamic Similarity Ranking (Priority: P1)

**Goal**: Display job listings ranked dynamically by cosine similarity with date filters in the `/jobs` page.

**Independent Test**: Load `/jobs`, see the list sorted by Match %, change the date filter range, click "Update Job List", and verify results adapt. If profile is un-synced, verify date-descending sorting and the "Sync Profile" badge appears in place of percentages.

### Tests for User Story 3
- [ ] T016 [P] [US3] Create integration tests for the raw SQL pgvector similarity query in `frontend/tests/integration/vector-query.test.ts`, verifying correct cosine-similarity ordering, date-range filtering, and the fallback to creation-date ordering when `embedding` is null.

### Implementation for User Story 3
- [ ] T017 [P] [US3] Implement the raw SQL pgvector similarity search method using `prisma.$queryRawUnsafe` in `frontend/src/lib/db/job-query.ts`. The method must: accept `profileEmbedding: number[] | null`, `daysLimit: number`, and `limit: number`; when embedding is non-null execute cosine similarity (`1 - (embedding <=> $1::vector)`) filtered by `postedAt >= NOW() - $2 * INTERVAL '1 day'`; fallback to `ORDER BY "createdAt" DESC` when embedding is null.
- [ ] T018 [P] [US3] Create API route `GET /api/jobs` in `frontend/src/app/api/jobs/route.ts` to: authenticate the session; load the user's `UserProfile.embedding`; call `job-query.ts`; return the list with `matchScore` as a percentage (or `null` for un-synced profiles).
- [ ] T019 [US3] Implement UI components in `frontend/src/components/jobs/`: `MatchBadge.tsx` (color-coded badge: High Match green ≥80%, Medium Match yellow 60–79%, Low Match gray <60%, "Sync Profile" CTA when null); `JobCard.tsx` (title, company, location, postedAt, MatchBadge); `JobList.tsx` (list container with date-range selector defaulting to 15 days and "Update Job List" button).
- [ ] T020 [US3] Create the job dashboard page at `frontend/src/app/(main)/jobs/page.tsx` composing `JobList` and wiring query parameters (`days`, `limit`) to `GET /api/jobs`.

**Checkpoint**: User can view and filter job listings ranked dynamically by compatibility score.

---

## Phase 6: User Story 4 — On-Demand Deep Analysis (Priority: P2)

**Goal**: Request and view a cached deep LLM comparison (strengths, weaknesses, verdict) of a vacancy.

**Independent Test**: Click "Analyze with AI" on a job, view the detailed report, close and reopen the job details, verify the analysis loads instantly from the `JobAnalysis` database cache without calling the LLM API again.

### Tests for User Story 4
- [ ] T021 [P] [US4] Create integration tests for the deep analysis endpoint in `frontend/tests/integration/deep-analysis.test.ts` verifying: (1) first call returns LLM-generated analysis and persists it to `JobAnalysis`; (2) second call returns cached result in <100ms without triggering the LLM.

### Implementation for User Story 4
- [ ] T022 [P] [US4] Implement the LLM deep analysis prompter in `frontend/src/services/deepAnalysisService.ts` — accepts raw profile text and raw job description, calls `AI_PROVIDER_SUMMARIES` (fallback `AI_PROVIDER_DEFAULT`) from `SystemConfig`, and returns structured `{ strengths, weaknesses, missingSkills, verdict, justification }`.
- [ ] T023 [P] [US4] Create API endpoint `POST /api/jobs/[id]/analyze` in `frontend/src/app/api/jobs/[id]/analyze/route.ts` — checks `JobAnalysis` cache first; if present returns cached result; if absent calls `deepAnalysisService`, saves result to `JobAnalysis` table, returns the new record.
- [ ] T024 [US4] Create the side details panel component `frontend/src/components/jobs/JobDetailsPanel.tsx` showing: job title/company header, "Analyze with AI" button with loading state, and when analysis is loaded — strengths list, weaknesses list, missing skills list, and the verdict badge (`APPLY` green / `CAUTION` yellow / `IGNORE` red) with justification text.

**Checkpoint**: All user stories complete. Candidate can request and cached-load deep analyses.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Admin UI health indicators, model pre-warmup, and final validation.

- [ ] T025 Add provider health status indicators (`Healthy`, `Blocked`, `Not Configured`) and "Reset" action buttons to the Settings panel component `frontend/src/components/settings/LLMModelsSettings.tsx`. The "Reset" button must clear the `BLOCKED` status for the selected provider in `SystemConfig`.
- [ ] T026 [P] Setup TensorFlow.js USE model pre-warmup (call `generateEmbedding("")` once) in the server startup hook at `frontend/src/app/layout.tsx` or an appropriate server-side initialization file to avoid cold-start latency on first user request.
- [ ] T027 Run `npm run lint` and `npm run build` to verify no TypeScript errors or lint violations across all new files.
- [ ] T028 Validate full flow end-to-end against the steps in `quickstart.md` (sync profile → `/jobs` listing → deep analysis → admin panel health check).

---

## Dependencies & Execution Order

### Phase Dependencies

1.  **Setup (Phase 1)**: Must run first.
2.  **Foundational (Phase 2)**: Depends on T001. Blocks all subsequent tasks.
3.  **User Stories (Phases 3 to 6)**: Start after T006 is complete.
    *   `US1` (Profile Sync) and `US2` (Worker Classification) can be developed in parallel.
    *   `US3` (Job Listing/Matching) depends on database models (T002) and vector generation (T005) but is functionally independent from `US1` and `US2`.
    *   `US4` (Deep Analysis) requires the UI structure of `US3` for details rendering.
4.  **Polish (Phase 7)**: Depends on all user story tasks being completed.

### User Story Dependencies

- **US1** (Profile Sync): Independently testable after Phase 2. No dependency on US2–US4.
- **US2** (Classification Worker): Independently testable after Phase 2. No dependency on US1.
- **US3** (Job Panel): Depends on Phase 2 (schema + vector service). Functionally independent from US1/US2 — can be tested with mock embeddings.
- **US4** (Deep Analysis): Depends on US3 for the `JobDetailsPanel` rendering slot. `deepAnalysisService` and API can be built in parallel with US3.

---

## Parallel Execution Examples

### Phase 2 (Foundational)
```bash
# Can run in parallel after T001:
T004: "Implement tensorflow-model.ts singleton loader"
T005: "Implement vector-service.ts"
T006: "Create vector-service.test.ts"
```

### Phase 4 (US2 — Classification Worker)
```bash
# Can run in parallel:
T011: "Create circuit-breaker.test.ts"
T012: "Create classification-worker.test.ts"
T013: "Implement circuit-breaker.ts"
T014: "Implement jobClassificationService.ts"
# T015 (worker orchestrator) depends on T013 + T014
```

### Phase 5 (US3 — Jobs Panel)
```bash
# Can run in parallel:
T016: "Create vector-query.test.ts"
T017: "Implement job-query.ts"
T018: "Implement GET /api/jobs route"
T019: "Implement MatchBadge, JobCard, JobList components"
# T020 (page) depends on T017 + T018 + T019
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 3)
1.  Complete Setup (T001) & Foundation (T002-T006). ✅
2.  Complete Profile Sync (T007-T010). ✅
3.  Complete Vector Query & Vacancy list (T016-T020).
4.  Verify basic matching ranking against real synced profile.

### Incremental Delivery
1.  ✅ Foundation → Local vectorization and DB schema ready.
2.  ✅ MVP Phase A → Candidate can Sync profile.
3.  MVP Phase B → Candidate can view `/jobs` with Match % badges.
4.  Worker → Crawled jobs get classified automatically with Circuit Breaker support.
5.  Deep Analysis → Candidate gets detailed fits/weaknesses on-demand.
6.  Admin UI → Health indicators for LLM providers in Settings panel.
