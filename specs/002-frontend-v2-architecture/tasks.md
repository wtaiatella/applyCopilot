# Tasks: ApplyCopilot V2 Frontend Architecture Rewrite

**Input**: Design documents from `/specs/002-frontend-v2-architecture/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/api-contracts.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and core shared configurations.

- [x] T001 Create folders and project skeleton in `frontend/src/`
- [x] T002 Initialize Next.js 16 App Router project in `frontend/`
- [x] T003 [P] Configure TypeScript compiler settings in `frontend/tsconfig.json`
- [x] T004 [P] Configure ESLint and Prettier formatting tools in `frontend/eslint.config.mjs`
- [x] T005 Setup Winston logger with payload auditing directory outputs in `frontend/src/lib/logging/logger.ts`
- [x] T006 [P] Configure Jest unit and integration testing environment in `frontend/jest.config.js` and `frontend/jest.setup.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, authorization, API routing frame, and AI client dynamic routers.

**⚠️ CRITICAL**: No user story implementation can begin until all Phase 2 tasks are complete.

- [x] T007 Define models (User, UserProfile, Experience, Education, Project, Skill, Reference, CV, CVBullet, SystemConfig) in `frontend/prisma/schema.prisma`
- [x] T008 Generate database migrations and include the HNSW index and vector similarity configurations in `frontend/prisma/migrations/`
- [x] T009 Create seed script seeding default portal LLM settings in `frontend/prisma/seed.ts`
- [x] T010 [P] Implement NextAuth.js v5 credentials adapter in `frontend/src/lib/auth/authConfig.ts`
- [x] T011 [P] Configure Next.js middleware for route protection in `frontend/src/middleware.ts`
- [x] T012 Implement centralized dynamic AI client routing to Ollama/Gemini/Claude based on SystemConfig settings in `frontend/src/lib/ai/aiClient.ts`
- [x] T013 Define Zod validation schemas for requests and DTOs in `frontend/src/lib/validation/profileSchemas.ts`

**Checkpoint**: Foundation complete. API, Authentication, and Database layers ready for parallel User Story implementation.

---

## Phase 3: User Story 1 - Landing Page & Authentication (Priority: P0) 🎯 MVP

**Goal**: Visitors can view a marketing landing page, register/login, and request password resets.

**Independent Test**: Run NextAuth endpoints to register/login a test account, submit password reset, and verify the token link in `debug/emails/`.

### Implementation for User Story 1

- [x] T014 [P] [US1] Create landing page sections (Hero, Features, How It Works, CTA) in `frontend/src/components/landing/`
- [x] T015 [P] [US1] Implement landing page redirect CTAs based on session auth in `frontend/src/app/page.tsx`
- [x] T016 [US1] Implement registration endpoint POST handler in `frontend/src/app/api/auth/register/route.ts`
- [x] T017 [P] [US1] Create registration UI page in `frontend/src/app/(auth)/register/page.tsx` (comply with Constitution Sec VII: no custom color classes, inherit theme tokens)
- [x] T018 [P] [US1] Create login UI page in `frontend/src/app/(auth)/login/page.tsx` (comply with Constitution Sec VII: no custom color classes, inherit theme tokens)
- [x] T019 [US1] Implement forgot-password token generator (SHA-256 hashed) and Resend API logger handler in `frontend/src/app/api/auth/forgot-password/route.ts`
- [x] T020 [P] [US1] Create forgot-password input form UI in `frontend/src/app/(auth)/forgot-password/page.tsx` (comply with Constitution Sec VII: no custom color classes, inherit theme tokens)
- [x] T021 [US1] Implement reset-password endpoint POST handler in `frontend/src/app/api/auth/reset-password/route.ts`
- [x] T022 [P] [US1] Create reset-password UI form page in `frontend/src/app/(auth)/reset-password/page.tsx` (comply with Constitution Sec VII: no custom color classes, inherit theme tokens)
- [x] T023 [US1] Create collapsible sidebar and header main layout in `frontend/src/app/(main)/layout.tsx` (expanded on >= 1280px, persists preference in localStorage, complies with Constitution Sec VII)
- [x] T024 [P] [US1] Create minimal dashboard welcome page in `frontend/src/app/(main)/dashboard/page.tsx` (comply with Constitution Sec VII: no custom color classes, inherit theme tokens)
- [x] T025 [US1] Add Jest integration tests for forgot/reset password API handlers in `frontend/tests/integration/auth.test.ts`

**Checkpoint**: Landing, registration, login, and forgot password routes fully operational and testable.

---

## Phase 4: User Story 2 - Profile Setup via CV Import (Priority: P1)

**Goal**: Users can upload a PDF or DOCX resume, streaming progress and populating database sections.

**Independent Test**: Upload a resume, verify SSE progress increments from 20% to 100%, and verify that data is correctly merged into database tables.

### Implementation for User Story 2

- [x] T026 [P] [US2] Implement mammoth-based DOCX text extraction and pdf2json-based PDF text extraction in `frontend/src/lib/parsing/documentExtract.ts` (include dev-mode hook to save raw uploads to `debug/uploads/` when `LOG_LEVEL=debug`)
- [x] T027 [US2] Implement centralized bullet, experience, and project normalization and merging in `frontend/src/lib/merge/profileMergeService.ts` (if a merged bullet matches an archived one, set `isArchived: false` to reactivate it and preserve historic CV relationships)
- [x] T028 [P] [US2] Create unit tests verifying deduplication, normalization, and archived bullet reactivation rules in `frontend/tests/unit/merge.test.ts`
- [x] T028b [US2] Add `AIUsageLog` model to `frontend/prisma/schema.prisma` and execute migrations to support DB-driven rate limiting
- [x] T029 [US2] Implement Server-Sent Events (SSE) parsing handler in `frontend/src/app/api/profile/parse/route.ts` orchestrating text extraction, rate-limiting validation (5 parses/day), sequential LLM parsing, and fallback prompts for empty projects/skills
- [x] T030 [US2] Implement client-side parseCV service caller to process the event stream in `frontend/src/services/profileService.ts`
- [x] T031 [P] [US2] Create CV Uploader widget component with progress bar in `frontend/src/components/profile/CVUploader.tsx`
- [x] T031b [US2] Initialize openapi.yaml in `frontend/public/` and build Swagger UI route at `frontend/src/app/api-docs/` exposing Phase 3 and Phase 4 API endpoints

**Checkpoint**: SSE CV upload pipeline, rate limiting, and parsing merge engines verified and working.


---

## Phase 5: User Story 3 - Profile Editing (Priority: P1)

**Goal**: Users can navigate and edit profile sections without losing changes, auto-saving data.

**Independent Test**: Edit experiences or education fields, switch tabs, verify that changes are preserved on context, and verify auto-save completes within 1.5 seconds.

### Implementation for User Story 3

- [x] T032 [US3] Implement Profile state manager context with 1.5s debounced autosaves in `frontend/src/contexts/ProfileContext.tsx`
- [x] T033 [US3] Implement full profile API fetch endpoint in `frontend/src/app/api/profile/route.ts`
- [x] T034 [P] [US3] Create profile edit page in `frontend/src/app/(main)/profile/page.tsx`
- [x] T035 [US3] Implement dynamic Ant Design editable tabs layout in `frontend/src/components/profile/ProfileTabs.tsx`
- [x] T036 [US3] Implement Experience CRUD endpoints in `frontend/src/app/api/profile/experiences/route.ts` and `frontend/src/app/api/profile/experiences/[id]/route.ts`
- [x] T037 [US3] Implement Education CRUD endpoints in `frontend/src/app/api/profile/education/route.ts` and `frontend/src/app/api/profile/education/[id]/route.ts`
- [x] T038 [US3] Implement Project CRUD endpoints in `frontend/src/app/api/profile/projects/route.ts` and `frontend/src/app/api/profile/projects/[id]/route.ts`
- [x] T039 [US3] Implement Skills replace endpoint in `frontend/src/app/api/profile/skills/route.ts`
- [x] T040 [US3] Implement References replace endpoint in `frontend/src/app/api/profile/references/route.ts`
- [x] T041 [P] [US3] Add integration tests for all profile CRUD routes in `frontend/tests/integration/profile.test.ts`
- [x] T041b [US3] Update openapi.yaml in `frontend/public/` to include CRUD endpoints for profile, experiences, education, projects, skills, and references

**Checkpoint**: Background auto-save, ProfileContext state machine, and basic section CRUD endpoints validated.

---

## Phase 6: User Story 4 - Profile Tab UX Detail (Priority: P1)

**Goal**: Provide rich UI forms, drag-and-drop lists, present checkboxes, and custom bullet rows.

**Independent Test**: Reorder highlights, select active summaries, check Present checkboxes, and hover CV count badges.

### Implementation for User Story 4

- [x] T042 [US4] Implement basic data update and active summary sync endpoint in `frontend/src/app/api/profile/basic/route.ts`
- [x] T043 [P] [US4] Create Basic Data UI form with inline manual summary additions and drag-and-drop ordering in `frontend/src/components/profile/BasicDataForm.tsx`
- [x] T044 [US4] Implement AI summary generator route handler in `frontend/src/app/api/profile/summaries/generate/route.ts` (include rate-limiting validation: max 10 generations/hour)
- [x] T045 [P] [US4] Create AI summary generator Modal instructions form in `frontend/src/components/profile/SummaryGeneratorModal.tsx`
- [x] T046 [P] [US4] Create Experience form list UI with current date checkbox and bullet drag-drop sortable rows in `frontend/src/components/profile/ExperienceForm.tsx`
- [x] T047 [P] [US4] Create Education form list UI with current date and hideEndDate checkboxes in `frontend/src/components/profile/EducationForm.tsx`
- [x] T048 [P] [US4] Create Project form list UI with technologies tag input multi-select in `frontend/src/components/profile/ProjectForm.tsx`
- [x] T049 [P] [US4] Create flat Skills form list UI sorting alphabetically in `frontend/src/components/profile/SkillsForm.tsx`
- [ ] T049b [US4] Implement suggest skills REST API route POST /api/profile/skills/suggest and UI button trigger in `frontend/src/components/profile/SkillsForm.tsx`
- [x] T050 [P] [US4] Create References form list UI in `frontend/src/components/profile/ReferencesForm.tsx` — `canContact` field uses Ant Design `<Checkbox>` rendered inline in the table column and in the add-reference form row
- [x] T051 [P] [US4] Add Winston logging auditing integration tests for AI generation requests in `frontend/tests/integration/ai.test.ts`
- [x] T051b [US4] Update openapi.yaml in `frontend/public/` to include basic details PUT, AI summaries generator, and skills auto-suggest endpoints
- [ ] T051c [US4] Add unit/integration tests for Phase 6 UI behavior: bullet drag-and-drop ordering, bullet type dropdown (`BULLET`/`PARAGRAPH`), and "Current / Present" date checkbox logic in `frontend/tests/unit/profileForms.test.ts`

**Checkpoint**: Profile UI tab controls, drag-and-drop lists, and custom date checkbox logic completed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting requirements, admin structure, theme toggle, and lint/build checks.

- [x] T052 Create layout placeholder for ADMIN-only Settings in `frontend/src/app/(main)/settings/page.tsx` with ADMIN role guard (redirect non-ADMIN users)
- [ ] T052b Add integration test asserting that the `role` field is present as a claim in the NextAuth session JWT after login with an ADMIN-role user in `frontend/tests/integration/auth.test.ts`
- [ ] T053 Configure global dark mode toggler in `frontend/src/components/layout/ThemeToggle.tsx`
- [ ] T053b Add quickstart test assertion verifying that the dark/light mode preference survives a page reload (reads from `localStorage`) in `frontend/tests/quickstart.test.ts`
- [ ] T054 Run Next.js code compiler builds and ESLint checks to verify clean delivery compilation; also run `jest --coverage --collectCoverageFrom="src/lib/merge/**"` to assert 100% coverage on `ProfileMergeService` (SC2-007)
- [ ] T055 [P] Implement validation verification in `frontend/tests/quickstart.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──> Phase 2: Foundational ──> User Stories (US1, US2, US3, US4) ──> Phase 7: Polish
```
* **Setup (Phase 1)**: Can be implemented immediately.
* **Foundational (Phase 2)**: Depends on Setup. Blocks all User Stories.
* **User Stories (Phases 3-6)**: Depend on Foundation. Can be implemented in parallel if needed, though sequential order is recommended (US1 -> US2 -> US3 -> US4) to build on top of each layer.
* **Polish (Phase 7)**: Depends on all User Story completions.

### Parallel Opportunities
* Within **Phase 1**: Folder setups, TypeScript configuration, and linters (T001-T004) can run in parallel.
* Within **Phase 2**: NextAuth setup, middleware configuration, Zod validations, and AI Client config (T010-T013) can run in parallel.
* Once Phase 2 is complete, **User Story 1** (T014-T015, T017-T018, T020, T022, T024) features can be worked on in parallel.

---

## Parallel Example: User Story 1
```bash
# Developers can work on different authentication components simultaneously:
Task: "Create registration UI page using Ant Design Form in frontend/src/app/(auth)/register/page.tsx"
Task: "Create login UI page in frontend/src/app/(auth)/login/page.tsx"
Task: "Create forgot-password input form UI in frontend/src/app/(auth)/forgot-password/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete **Phase 1: Setup** tasks.
2. Complete **Phase 2: Foundational** tasks (Prisma PostgreSQL models, custom migrations, NextAuth setup).
3. Complete **Phase 3: User Story 1** (auth landing, login, register, reset password).
4. Run integration tests and manually verify authentication flow on localhost.
5. Deploy/Demo the authentication MVP.

### Incremental Delivery
* **Increment 1**: Foundation + User Story 1 (Authentication MVP ready).
* **Increment 2**: User Story 2 (Resume upload parser streaming progress).
* **Increment 3**: User Story 3 (Context-backed editing with background auto-saves).
* **Increment 4**: User Story 4 (Sortable tabs, drag-drop reordering, current date controls, and flat skills).
