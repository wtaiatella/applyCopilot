# Data Model: Job Discovery & Scraper Worker

## 1. Schema Extensions (Prisma)

The following models will be added to the existing `prisma/schema.prisma` file. They use `CUID2` for identifiers to maintain consistency with the existing ApplyCopilot Frontend V2 architecture.

```prisma
enum ScrapeTaskType {
  LIST
  DEEP
}

enum ScrapeTaskStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

// Represents the health/operational state of a portal's search URL configuration.
// ACTIVE   → Selectors are working; normal operation.
// BROKEN   → 3 consecutive attempts failed; excluded from subsequent automated runs until updated.
// DISABLED → Manually deactivated by an administrator.
enum PortalStatus {
  ACTIVE
  BROKEN
  DISABLED
}

model ScrapeTask {
  id           String           @id @default(cuid())
  type         ScrapeTaskType
  portalId     String           // Identifier for the portal (e.g., 'linkedin', 'github')
  status       ScrapeTaskStatus @default(PENDING)
  progress     Int              @default(0)
  resultsCount Int              @default(0)
  errorMessage String?

  // Context for manual/admin triggers
  searchUrl    String?          // The URL used for a manual Step 1 trigger
  keywords     String?          // Search keywords provided by the user
  location     String?          // Location filter provided by the user
  triggeredBy  String?          // User ID (if applicable)

  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
}

model PortalSearchUrl {
  id              String       @id @default(cuid())
  portalId        String       // Identifier for the portal (e.g., 'linkedin')
  url             String       // The pre-configured search URL
  name            String       // Friendly name for this search (e.g., "Senior React Remote")
  isActive        Boolean      @default(true)
  status          PortalStatus @default(ACTIVE)

  // Informational flag: set on registration by checking the portal's robots.txt.
  // Does NOT automatically block scraping. Admin decides manually via the enable/disable toggle.
  isRobotsBlocked Boolean      @default(false)

  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model JobListing {
  id                    String   @id @default(cuid())
  portalId              String
  externalJobId         String   // ID provided by the portal (used for deduplication)

  title                 String
  company               String
  location              String?
  url                   String

  // Explicitly tracks Step 2 completion status
  isFullDescriptionFetched Boolean  @default(false)

  // Populated in Step 2 Deep Scrape (or in Step 1 if portal delivers it early)
  fullDescription       String?  @db.Text

  // Basic Metadata (extracted in Step 1 if deterministically available in results list)
  locationType     String?   // "Remote" | "Hybrid" | "On-site"
  countries        String?   // Specific countries the role is open to
  jobType          String?   // "Full-time" | "Contract" | "Internship"
  experienceLevel  String?   // "Senior" | "Mid" | "Entry"
  postedAt         DateTime? // Published date from the portal
  salaryMin        Float?    // Lower bound of salary range
  salaryMax        Float?    // Upper bound of salary range
  currency         String?   // Currency code for the salary (e.g., "USD")

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Deduplication constraint
  @@unique([portalId, externalJobId])
}

model SystemConfig {
  id                  String   @id @default(cuid())
  globalScrapeInterval Int     @default(360) // Minutes between automated runs (default 6 hours)
  maxConcurrency       Int     @default(3)   // Simultaneous portal scrapes
  rateLimitDelay       Int     @default(1000) // Milliseconds to wait between requests (default 1 second)
  maxExtractionRetries Int     @default(3)   // Failures before flagging configuration as BROKEN
  userAgent            String  @default("ApplyCopilot/1.0") // Sent on all outbound HTTP requests

  updatedAt            DateTime @updatedAt
}
```

## 2. DTO Contracts (TypeScript)

These DTOs will be placed in `src/types/scraper.ts`.

```typescript
export type ScrapeTaskType = 'LIST' | 'DEEP';
export type ScrapeTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type PortalStatus = 'ACTIVE' | 'BROKEN' | 'DISABLED';

export interface ScrapeTaskDTO {
  id: string;
  type: ScrapeTaskType;
  portalId: string;
  status: ScrapeTaskStatus;
  progress: number;
  resultsCount: number;
  errorMessage: string | null;
  searchUrl: string | null;
  keywords: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSearchUrlDTO {
  id: string;
  portalId: string;
  url: string;
  name: string;
  isActive: boolean;
  status: PortalStatus;
  isRobotsBlocked: boolean;
}

export interface JobListingDTO {
  id: string;
  portalId: string;
  externalJobId: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  isFullDescriptionFetched: boolean;
  fullDescription: string | null;
  locationType: string | null;
  countries: string | null;
  jobType: string | null;
  experienceLevel: string | null;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

export interface SystemConfigDTO {
  globalScrapeInterval: number;
  maxConcurrency: number;
  rateLimitDelay: number;
  maxExtractionRetries: number;
  userAgent: string;
}
```

## 3. Data Flow & Deduplication

1. **Step 1 (List Extraction)**:
   - Worker fetches HTML from `PortalSearchUrl`.
   - Extracts basic job listings (Title, Company, Location, URL, externalJobId, and optional metadata fields).
   - Upserts into `JobListing` using the unique constraint `[portalId, externalJobId]`. If it exists, it updates basic fields only.
   - If the portal strategy delivers full descriptions in Step 1 (e.g. Workable JSON), it sets `isFullDescriptionFetched = true` and writes `fullDescription` directly. Otherwise, it enqueues a `DEEP` scrape task.

2. **Step 2 (Deep Extraction)**:
   - Worker queries `JobListing` where `isFullDescriptionFetched = false`.
   - Visits each URL, leaving a `rateLimitDelay` (1-second default) between requests.
   - Extracts HTML, converts it to clean Markdown, updates `fullDescription`, and sets `isFullDescriptionFetched = true`.

## 4. Failure State Transitions

```
Task execution attempt →
  ├─ Success                  → save results, reset consecutive failure counter
  └─ Fail (attempt < 3)       → increment consecutive failure counter, retry
  └─ Fail (attempt = 3)       → set ScrapeTask status to FAILED,
                                 set PortalSearchUrl.status to BROKEN,
                                 stop automated runs for this URL configuration
```

## 5. Worker Recovery on Restart

On application boot (inside `instrumentation.ts`), the worker queries for any `ScrapeTask` records in `RUNNING` state and resets them to `PENDING`. This ensures idempotency and recovers tasks interrupted by crashes.
