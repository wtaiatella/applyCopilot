# Tasks: Job Classification & Semantic Matching

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

- [ ] T001 Install TensorFlow.js and Universal Sentence Encoder packages in `frontend/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema changes, local vectorization engine, and testing framework setup.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Update Prisma Schema in `frontend/prisma/schema.prisma` to include `Unsupported("vector(512)")` on `UserProfile` and `JobListing`, add the `ClassificationStatus` & `RecommendationVerdict` enums, and add the `JobAnalysis` model.
- [ ] T003 Generate the database migration using `prisma migrate dev --create-only`, manually add `CREATE EXTENSION IF NOT EXISTS vector;` at the top of the generated SQL migration file, and apply it to PostgreSQL.
- [ ] T004 Implement the Universal Sentence Encoder singleton model loader in `frontend/src/lib/ai/tensorflow-model.ts` with CPU backend initialization.
- [ ] T005 Implement the vector generation service in `frontend/src/lib/ai/vector-service.ts` to convert text strings to 512-dimension vectors.
- [ ] T006 Create unit tests for local vector generation in `frontend/tests/unit/vector-service.test.ts`.

**Checkpoint**: Foundation ready - local vectorization and database structure are verified and functional.

---

## Phase 3: User Story 1 - Profile Sync with AI (Priority: P1) 🎯 MVP

**Goal**: Clean and vectorize candidate profile data using the Summaries Provider LLM on-demand.

**Independent Test**: Edit candidate experience, check the status indicator showing "Out of Date", click "Sync with AI", and verify that the database contains the 512-dimension vector in `UserProfile` and the status updates to "Synced".

### Tests for User Story 1
- [ ] T007 [P] [US1] Create integration tests for the profile sync endpoint in `frontend/tests/integration/profile-sync.test.ts`.

### Implementation for User Story 1
- [ ] T008 [P] [US1] Implement profile text consolidation and LLM summarization logic in `frontend/src/services/profileSyncService.ts` using `AI_PROVIDER_SUMMARIES` from `SystemConfig`.
- [ ] T009 [P] [US1] Create API endpoint `POST /api/profile/sync` in `frontend/src/app/api/profile/sync/route.ts` to trigger LLM cleaning, generate a 512-dimension vector via `vector-service.ts`, and update `UserProfile`.
- [ ] T010 [US1] Add a manual "Sync with AI" button and last sync timestamp status text in the Profile page component `frontend/src/components/profile/ProfileTabs.tsx`.

**Checkpoint**: User Story 1 is functional. The user can manually clean and vectorize their profile.

---

## Phase 4: User Story 2 - Job Classification Worker (Priority: P1)

**Goal**: Background worker to clean and vectorize crawled job descriptions with LLM circuit breaker support.

**Independent Test**: Trigger the worker with a noise-heavy raw job listing, verify it requests LLM cleaning (using `AI_PROVIDER_PARSING`), computes the 512-dimension vector, saves it, and marks the job as `COMPLETED`.

### Tests for User Story 2
- [ ] T011 [P] [US2] Create unit and integration tests for the classification worker and circuit breaker in `frontend/tests/unit/classification-worker.test.ts`.

### Implementation for User Story 2
- [ ] T012 [P] [US2] Implement the LLM cleaning and technical summary extraction service in `frontend/src/services/jobClassificationService.ts`.
- [ ] T013 [P] [US2] Implement the "Circuit Breaker" error handler in `frontend/src/lib/ai/circuit-breaker.ts` that blocks LLM providers in `SystemConfig` upon HTTP 429, 401, or 402 errors.
- [ ] T014 [US2] Create the background queue worker in `frontend/src/lib/workers/classification-worker.ts` that processes listings where `classificationStatus = PENDING`, checks for LLM blocks, runs extraction, and vectorizes summaries.

**Checkpoint**: Background worker classifies newly crawled jobs and handles API rate limits safely.

---

## Phase 5: User Story 3 - Job Panel & Dynamic Similarity Ranking (Priority: P1)

**Goal**: Display job listings ranked dynamically by cosine similarity with date filters in the `/jobs` page.

**Independent Test**: Load `/jobs`, see the list sorted by Match %, change the date filter range, click "Update Job List", and verify the results adapt. If profile is un-synced, verify date sorting and "Sync Profile" badge.

### Tests for User Story 3
- [ ] T015 [P] [US3] Create integration tests for the raw SQL vector similarity query in `frontend/tests/integration/vector-query.test.ts`.

### Implementation for User Story 3
- [ ] T016 [P] [US3] Implement the raw SQL pgvector similarity search method using `prisma.$queryRaw` in `frontend/src/lib/db/job-query.ts` including date-range filtering.
- [ ] T017 [P] [US3] Create API route `GET /api/jobs` in `frontend/src/app/api/jobs/route.ts` to call `job-query.ts` and return vacancies with match scores.
- [ ] T018 [US3] Create the job dashboard route page `/jobs` in `frontend/src/app/(main)/jobs/page.tsx` containing the date range selector and "Update Job List" button.
- [ ] T019 [US3] Implement UI components in `frontend/src/components/jobs/` (`JobCard.tsx`, `MatchBadge.tsx`, `JobList.tsx`) to render color-coded match scores or the "Sync Profile" CTA.

**Checkpoint**: User can search and view job listings ranked dynamically by compatibility.

---

## Phase 6: User Story 4 - On-Demand Deep Analysis (Priority: P2)

**Goal**: Request and view a cached deep LLM comparison (strengths, weaknesses, verdict) of a vacancy.

**Independent Test**: Click "Analyze with AI" on a job, view the report, reload, and verify the analysis loads instantly from the `JobAnalysis` database cache.

### Tests for User Story 4
- [ ] T020 [P] [US4] Create integration tests for the deep analysis endpoint and cache validation in `frontend/tests/integration/deep-analysis.test.ts`.

### Implementation for User Story 4
- [ ] T021 [P] [US4] Implement the LLM deep analysis prompter in `frontend/src/services/deepAnalysisService.ts` using `AI_PROVIDER_SUMMARIES` or `AI_PROVIDER_DEFAULT`.
- [ ] T022 [P] [US4] Create API endpoint `POST /api/jobs/[id]/analyze` in `frontend/src/app/api/jobs/[id]/analyze/route.ts` to execute LLM analysis and save results to the `JobAnalysis` table.
- [ ] T023 [US4] Create the side details panel component `frontend/src/components/jobs/JobDetailsPanel.tsx` showing the "Analyze with AI" button, strengths, weaknesses, missing requirements list, and verdict.

**Checkpoint**: All user stories are complete. Candidate can request and cached-load deep analyses.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: UI status boards, error handling, pre-warmup, and validation.

- [ ] T024 Add provider health status indicators (`Healthy`, `Blocked`, `Not Configured`) and "Reset" buttons in the Settings panel component `frontend/src/components/settings/LLMModelsSettings.tsx`.
- [ ] T025 [P] Setup TensorFlow.js USE model pre-warmup (`generateEmbedding("")`) in the server boot initializer `frontend/src/app/layout.tsx` or server-start hook.
- [ ] T026 Run `npm run lint` and `npm run build` to verify code quality.
- [ ] T027 Validate full flow end-to-end against `quickstart.md`.

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

---

## Parallel Execution Example: Phase 2

```bash
# Developers A & B can install and configure TF USE locally
Task: "Implement local vector loader in frontend/src/lib/ai/tensorflow-model.ts" (T004)
Task: "Create local vector service in frontend/src/lib/ai/vector-service.ts" (T005)
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 3)
1.  Complete Setup (T001) & Foundation (T002-T006).
2.  Complete Profile Sync (T007-T010).
3.  Complete Vector Query & Vacancy list (T015-T019).
4.  Verify basic matching ranking against static mock profiles.

### Incremental Delivery
1.  Deliver Foundation.
2.  Deliver MVP (Candidate can Sync and see Match % badges).
3.  Deliver Background Worker (Crawled jobs get classified automatically with Circuit Breaker support).
4.  Deliver Deep Analysis (Candidate gets detailed fits/weaknesses on-demand).
5.  Deliver Admin UI health indicators.
