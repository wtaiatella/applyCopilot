# Implementation Plan: Job Discovery & Scraper Worker

**Branch**: `003-job-discovery` | **Date**: 2026-07-04 | **Spec**: [specs/003-job-discovery/spec.md](file:///Users/wagnertaiatella/repos/applyCopilot/specs/003-job-discovery/spec.md)
**Input**: Feature specification from `/specs/003-job-discovery/spec.md`

---

## Summary

This feature introduces an automated, background dual-scraping worker system. It runs two independent execution loops:
1. **Job List Worker (Step 1)**: Polls configured search URLs for active portals every 6 hours, executing `extractList()` to ingest basic job metadata and deduplicating them.
2. **Job Description Queue Worker (Step 2)**: Processes a database-backed queue of pending job descriptions with a 1-second delay between requests, executing `extractDeep()` to fetch individual job descriptions and convert them to clean Markdown using `turndown`.

Admin users can manually configure search URLs and test scraping strategies in real time through an Admin Settings panel (`/settings/portals`), monitored via Server-Sent Events (SSE) progress streams. If a portal configuration fails 3 consecutive times, it is marked as `BROKEN` in the database, skipping subsequent automated runs until developers update the extraction selectors. Any AI-based extraction must be encapsulated as an internal implementation detail within a specific portal's strategy module rather than as a system-level automatic fallback.

---

## Technical Context

**Language/Version**: TypeScript / Node.js 20+ (Next.js 16.2.7)  
**Primary Dependencies**: Prisma ORM, Cheerio (for DOM extraction), Turndown (HTML to Markdown conversion)  
**Storage**: PostgreSQL (via Prisma)  
**Testing**: Jest (Unit & Integration tests)  
**Target Platform**: Node.js backend running alongside Next.js in Docker  
**Project Type**: Background worker embedded within Next.js web application  
**Performance Goals**: Process 100 job listings (Step 1 + Step 2) in under 3 minutes per portal (excluding custom AI-based strategy latency)  
**Constraints**: Zero UI blocking, strict rate limiting (1-second delay between deep scrapings), database queue polling overhead minimized  
**Scale/Scope**: Background execution of multiple search URLs and queue tasks  

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-Driven**: PASS. Spec 003 is complete and aligned with core Spec 002.
- **Trunk-Based**: PASS. Working on feature branch `003-job-discovery`.
- **Pragmatic Testing**: PASS. Will write Jest unit tests for strategies and integration tests for worker queue loops.
- **English-Only**: PASS. All code and documentation are in English.
- **AI Cost Optimization**: PASS. System-level AI fallbacks are removed. Portals default to free Cheerio extraction; premium AI is only used if encapsulated directly inside a portal strategy as a developer choice.
- **Privacy by Default**: PASS. Data is processed locally and stored in the PostgreSQL database.
- **UI Consistency**: PASS. Admin Portal UI will inherit from Ant Design tokens and Tailwind CSS 4, integrated under the existing `<ConfigProvider>`.
- **Standardized Logging**: PASS. Winston is used for worker progress and failures. Payload auditing outputs raw HTML and JSON results to `/debug` when `LOG_LEVEL=debug`.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-job-discovery/
├── spec.md              # Feature specification
├── plan.md              # This implementation plan
├── research.md          # Design decisions and architecture research
├── data-model.md        # Prisma schema updates and DTO definitions
├── quickstart.md        # Developer setup and instructions
├── checklists/
│   └── requirements.md  # Specification Quality Checklist
└── contracts/
    └── api-contracts.md # API endpoint specifications
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   ├── (main)/
│   │   │   └── settings/
│   │   │       └── portals/      # Admin UI for portal URL configurations
│   │   └── api/
│   │       ├── settings/
│   │       │   └── portals/      # API endpoints for CRUD
│   │       └── scrape/           # Manual trigger and SSE stream endpoints
│   ├── components/
│   │   └── settings/             # Portal URL management UI components
│   ├── lib/
│   │   └── scraper/              # Core background worker logic
│   │       ├── queue.ts          # PostgreSQL queue manager (polling loops)
│   │       ├── engine.ts         # Scrape processor interface runner
│   │       └── portals/          # Individual portal strategy modules
│   │           ├── workable.ts   # Workable strategy (async extractList pagination)
│   │           └── linkedin.ts   # LinkedIn strategy (Cheerio)
│   ├── types/
│   │   └── scraper.ts            # ScrapeTask, PortalSearchUrl, and JobListing DTOs
│   └── instrumentation.ts        # Next.js startup bootstrapping for the loops
├── prisma/
│   └── schema.prisma             # ScrapeTask, PortalSearchUrl, JobListing, SystemConfig
└── tests/
    └── scraper/                  # Jest tests for strategies and queue workers
```

**Structure Decision**: Background workers are integrated into Next.js using `instrumentation.ts` to avoid new microservices or Redis infrastructure. Polling intervals and queues are backed by PostgreSQL and managed through Prisma.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|:---|:---|:---|
| Polling DB for SSE | Simplicity | Redis Pub/Sub or WebSockets would require additional infrastructure dependencies. |
| Async `extractList` | Workable pagination requires external HTTP requests | Synchronous strategy could not fetch successive JSON pages. |

---

## Proposed Changes

### Database & Types
- **Prisma Schema**: Add `ScrapeTask`, `PortalSearchUrl`, `JobListing`, and `SystemConfig` models as specified in `data-model.md`.
- **TypeScript DTOs**: Create `frontend/src/types/scraper.ts` containing DTOs for frontend-backend data contracts.

### Background Worker Engine (`frontend/src/lib/scraper/`)
- **Queue Manager (`queue.ts`)**: Implement `Job List Worker` (Step 1) and `Job Description Queue Worker` (Step 2) polling loops.
- **Scraper Engine (`engine.ts`)**: Implement the interface runner, error-handling (task retries, `BROKEN` state updates), and payload auditing (writing to `/debug/`).
- **Strategy Registry**: Implement registry for loading strategies.
- **Turndown Service**: Integrate Turndown for converting Step 2 HTML to clean Markdown.

### Portals
- **Workable (`workable.ts`)**: Implement strategy. `extractList()` is async, fetches paginated JSON pages, extracts description inline, sets `isFullDescriptionFetched: true`.
- **LinkedIn (`linkedin.ts`)**: Standard Cheerio-based strategy.

### Next.js Integration
- **`instrumentation.ts`**: Bootstrap background loops on Node.js startup (when running in non-serverless dev mode).

### API & Frontend
- **API Routes**: Create endpoints under `/api/settings/portals` and `/api/scrape/`.
- **Admin UI**: Create sub-navigation at `/settings/portals` using Ant Design components, including the synchronous Scraper Tester playground.
