# Tasks: Job Discovery & Scraper Worker

**Input**: Design documents from `/specs/003-job-discovery/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths shown below assume single project - Next.js in `frontend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic dependencies

- [ ] T001 Install `cheerio` and `turndown` packages in frontend (`cd frontend && npm install cheerio turndown && npm install --save-dev @types/turndown`)
- [ ] T002 [P] Create DTOs in `frontend/src/types/scraper.ts` based on data-model.md
- [ ] T003 [P] Create directory structure `frontend/src/lib/scraper/portals` and `frontend/src/components/settings/portals`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core database schema and instrumentation initialization that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add `ScrapeTask`, `PortalSearchUrl`, `JobListing`, and `SystemConfig` entities to `frontend/prisma/schema.prisma` per data-model.md
- [ ] T005 Create database migration and apply schema changes (`cd frontend && npx prisma migrate dev --name init_scraper_worker`)
- [ ] T006 Update `frontend/next.config.ts` to enable experimental instrumentation hooks via `experimental: { instrumentationHook: true }`
- [ ] T007 Create background loop bootstrapper in `frontend/src/instrumentation.ts` to hook into Next.js startup
- [ ] T008 Implement worker startup crash recovery inside `frontend/src/instrumentation.ts` that resets `RUNNING` tasks back to `PENDING`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Automated Background Dual-Scraping (Priority: P1) 🎯 MVP

**Goal**: Automatically run scraping tasks in the background at regular intervals so that the job database is continuously updated with both new job listings and their full descriptions.

**Independent Test**: Configure a background schedule, let it run, and verify that both new basic job entries and their full descriptions are saved to the database, while the web UI remains responsive.

### Implementation for User Story 1

- [ ] T009 [US1] Create Queue Manager in `frontend/src/lib/scraper/queue.ts` to poll database tasks and schedule Step 1 and Step 2 execution loops
- [ ] T010 [US1] Create strategy interface `ScraperStrategy` and runner engine in `frontend/src/lib/scraper/engine.ts`
- [ ] T011 [US1] Implement standard HTML/JSON fetcher logic in `frontend/src/lib/scraper/engine.ts` with custom User-Agent configuration support
- [ ] T012 [US1] Implement the Portal Strategy Registry in `frontend/src/lib/scraper/registry.ts`
- [ ] T013 [P] [US1] Implement basic example portal strategy in `frontend/src/lib/scraper/portals/example.ts`
- [ ] T014 [US1] Implement the Job List Worker (Step 1 loop, every 6 hours) and Job Description Queue Worker (Step 2 loop, 1-second delay) in `frontend/src/lib/scraper/queue.ts`
- [ ] T015 [US1] Write Jest unit tests for strategies in `frontend/tests/scraper/strategies.test.ts`
- [ ] T016 [US1] Write Jest integration test for queue workers in `frontend/tests/scraper/queue.test.ts`

**Checkpoint**: At this point, the background worker automatically processes Step 1 and Step 2 in the background and populates the database.

---

## Phase 4: User Story 2 - Synchronous Scraper Tester (Priority: P1)

**Goal**: Manually test a scraper strategy against a specific URL and immediately see the extracted JSON results.

**Independent Test**: Use the "Scraper Tester" block in settings, run tests against a URL, and verify raw JSON is rendered synchronously on the screen.

### Implementation for User Story 2

- [ ] T017 [US2] Create synchronous scraper tester endpoint `POST /api/scrape/test` in `frontend/src/app/api/scrape/test/route.ts`
- [ ] T018 [US2] Implement SSE progress stream endpoint `GET /api/scrape/stream` in `frontend/src/app/api/scrape/stream/route.ts` using a Prisma polling loop to track manual scraper triggers
- [ ] T019 [US2] Build manual trigger and results component `frontend/src/components/settings/portals/ManualScrapeTrigger.tsx`
- [ ] T020 [US2] Write unit tests for tester and SSE stream endpoints in `frontend/tests/scraper/api.test.ts`

**Checkpoint**: Users can now test strategies synchronously in the UI and receive real-time progress updates.

---

## Phase 5: User Story 3 - Portal Search Management and Deduplication (Priority: P1)

**Goal**: Manage search URLs, ensure deduplication, and handle portal failure states.

**Independent Test**: Access the Settings UI, configure multiple search URLs, verify deduplication on identical listings, and trigger 3 consecutive failures to check BROKEN flag.

### Implementation for User Story 3

- [ ] T021 [US3] Create REST API endpoints for portal search URL CRUD under `frontend/src/app/api/settings/portals/route.ts` and `frontend/src/app/api/settings/portals/[id]/route.ts`
- [ ] T022 [US3] Apply session authentication middleware to portal settings and scrape API routes
- [ ] T023 [US3] Implement `robots.txt` fetching and informational parsing flag on portal settings API creation
- [ ] T024 [US3] Implement deduplication upsert logic (`@@unique([portalId, externalJobId])`) in the worker engine in `frontend/src/lib/scraper/engine.ts`
- [ ] T025 [US3] Implement task-level retries (3 attempts) and Broken status transitions for `PortalSearchUrl` on task failures in `frontend/src/lib/scraper/engine.ts`
- [ ] T026 [US3] Create global settings API and configurations (Interval, Delay, Concurrency, Max Retries, User-Agent) under `frontend/src/app/api/settings/config/route.ts`
- [ ] T027 [US3] Build admin Portal URL Settings list and controls UI in `frontend/src/components/settings/portals/PortalSettingsList.tsx`
- [ ] T028 [US3] Build parent admin settings page at `frontend/src/app/(main)/settings/portals/page.tsx`
- [ ] T029 [US3] Write Jest tests for deduplication and failure state transitions in `frontend/tests/scraper/engine.test.ts`

**Checkpoint**: Administrators can manage portal URLs, configurations are persistent, and extraction failures flag broken portals.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: General stability, error management, logging, and performance checking

- [ ] T030 Add Winston logging (`INFO`, `WARN`, `ERROR`, `DEBUG`) and global file logging in `frontend/src/lib/scraper/queue.ts` and `engine.ts`
- [ ] T031 Implement Payload Auditing: save raw HTML and extracted strategy JSON to `/debug/scraper/` when `LOG_LEVEL=debug`
- [ ] T032 Implement rate-limiting backoff: double interval with jitter (up to 5 min) on HTTP 429 responses in `frontend/src/lib/scraper/engine.ts`
- [ ] T033 Implement UI pending state for Step 2: show descriptions as pending when `isFullDescriptionFetched = false` in `frontend/src/components/jobs/JobDetail.tsx`
- [ ] T034 Run performance verification script in `frontend/tests_scripts/load-scraper.ts` to ensure 100 listings process in under 3 minutes
- [ ] T035 [P] Complete documentation updates in `specs/003-job-discovery/quickstart.md` and verify final build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (Worker Loop) is the MVP and should be completed first.
  - User Story 2 (Tester UI) and User Story 3 (Admin Settings CRUD) can be implemented in parallel after User Story 1.
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- DTO creation and basic folder setup can happen immediately in parallel.
- All CRUD API routes for `PortalSearchUrl` (T021, T022) can be built in parallel.
- Jest tests for the queue manager can run parallel to the actual engine implementation.

---

## Parallel Example: User Story 1

```bash
# Launch all models and DTO files for User Story 1 together:
Task: "Create DTOs in frontend/src/types/scraper.ts based on data-model.md"
Task: "Create basic example portal strategy in frontend/src/lib/scraper/portals/example.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Verify background worker picks up dummy tasks and executes the extraction loop locally.
5. Proceed to UI extensions (US2, US3) once the core engine is robust.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories
