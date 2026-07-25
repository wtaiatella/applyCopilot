# Implementation Plan: Job Classification & Semantic Matching

**Branch**: `004-job-classification` | **Date**: 2026-07-07 | **Spec**: [spec.md](file:///Users/wagnertaiatella/repos/applyCopilot/specs/004-job-classification/spec.md)
**Input**: Feature specification from `specs/004-job-classification/spec.md`

## Summary

Implement a two-stage (Hybrid) job classification and matching pipeline. 
*   **Stage 1 (Semantic Filtering)**: Converts cleaned job descriptions and the candidate's profile summary into 512-dimension vector embeddings locally using the Google Universal Sentence Encoder (USE) via TensorFlow.js. We then perform dynamic cosine similarity calculations inside PostgreSQL using the `pgvector` extension, filtered by publication date (default: last 15 days) to rank vacancies efficiently.
*   **Stage 2 (Deep LLM Analysis)**: Triggered on-demand when a user inspects a job's details. Evaluates the candidate's raw profile against the raw job description to identify strengths, weaknesses, gaps, and an application recommendation. Results are cached in the database.
*   **Profile Sync**: Manual "Sync with AI" button in the Profile page to trigger the LLM cleanup and local vectorization, avoiding automatic trigger costs.
*   **LLM Provider Circuit Breaker**: If LLM requests fail (rate limits/auth/quota issues), the specific provider is marked as `BLOCKED` in `SystemConfig` for 1 hour, and tasks remain `PENDING`. The background worker skips classification for blocked providers. The Admin "LLM Models" settings panel is updated with a real-time health indicator (Healthy, Blocked, Not Configured) and a manual "Reset" button.

---

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+ (Next.js 16 App Router)  
**Primary Dependencies**: `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow-models/universal-sentence-encoder`, `@prisma/client`  
**Storage**: PostgreSQL 15+ (with `pgvector` extension)  
**Testing**: Jest (unit/integration tests)  
**Target Platform**: Node.js server (Next.js backend routes and background worker)  
**Project Type**: web-service / web-application  
**Performance Goals**: dynamic semantic similarity query for up to 1,000 active vacancies within 300ms using `pgvector` index.  
**Constraints**: server must load the ~30MB USE model in memory once (lazy-loaded or on startup); local model must execute vectorizations under 1 second per item without blocking the main event loop.  
**Scale/Scope**: ~10,000 total vacancies, daily scraper influx of ~50-100 listings, single-user profile.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Rule I (Spec-Driven Development)**: PASS. Specification is fully written and approved at `specs/004-job-classification/spec.md`.
- **Rule V (AI Cost Optimization)**: PASS. Pre-filtering is done locally using TensorFlow.js (free). Premium LLMs are used only for text cleaning (done once per profile update / job scrape) and deep analysis (done strictly on-demand).
- **Rule VI (Privacy by Default)**: PASS. Matching vector comparisons run fully locally on our database server.
- **Rule VII (UI Consistency)**: PASS. The `/jobs` UI will be built using Ant Design 6, Tailwind CSS 4, and Centralized ConfigProvider dark mode (`theme.darkAlgorithm`).
- **Rule VIII (Standardized Logging)**: PASS. Background workers use structured Winston logging, and LLM payloads will be dumped into the `/debug` directory in development mode.
- **Rule III (Pragmatic Testing)**: PASS. Unit tests will cover the TensorFlow matcher service, and integration tests will verify the `pgvector` database query. Minimum 80% coverage is targeted.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-job-classification/
├── spec.md              # Feature specification (WHAT & WHY)
├── plan.md              # This file (HOW)
├── research.md          # Phase 0 output (Technical decisions & details)
├── data-model.md        # Phase 1 output (Prisma Schema changes)
├── quickstart.md        # Phase 1 output (Setup & Verification guidelines)
└── checklists/
    └── requirements.md  # Quality validation checklist
```

### Source Code (repository root)

```text
frontend/
├── prisma/
│   └── schema.prisma    # Prisma schema (PostgreSQL schemas)
├── src/
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── jobs/    # New frontend page/route for job listings and matches
│   │   │   └── profile/ # Updated profile page with Sync button
│   │   └── api/
│   │       ├── jobs/
│   │       │   ├── route.ts          # GET jobs with dynamic pgvector ranking
│   │       │   └── [id]/
│   │       │       └── analyze/      # POST on-demand LLM analysis endpoint
│   │       └── profile/
│   │           └── sync/             # POST profile cleaning & embedding endpoint
│   ├── components/
│   │   └── jobs/                     # JobCard, JobList, MatchBadge, JobDetailsPanel
│   └── lib/
│       ├── ai/
│       │   ├── tensorflow-model.ts   # TensorFlow USE local model loader
│       │   └── vector-service.ts     # Local model vector generation logic
│       └── db/
│           └── job-query.ts          # Custom prisma.$queryRaw for pgvector similarity
└── tests/
    ├── integration/
    │   └── vector-query.test.ts      # Verifies pgvector queries & date filters
    └── unit/
        └── vector-service.test.ts    # Verifies local embedding generation
```

**Structure Decision**: Web application structure under `frontend/` (Next.js App Router). Database-backed background processes and custom queries will be placed inside unified helper services under `frontend/src/lib/`.

---

## Complexity Tracking

*No constitution violations present. No exceptions required.*
