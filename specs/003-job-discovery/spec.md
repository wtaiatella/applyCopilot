# Feature Specification: Job Discovery & Scraper Worker

**Feature Branch**: `003-job-discovery`  
**Created**: 2026-07-02  
**Status**: Draft  
**Input**: User description: "
# Sistema de Scrape Eficiente para Portais de Busca

O sistema deve suportar dois modos de operação:
- **Workers Automáticos**: Executam scrapes em intervalos regulares sem impactar a navegação do usuário
- **Portal Admin**: Permite testes manuais de URLs de jobList e jobDescription

## Processamento Independente com Controle de Intervalos

A leitura de jobList e jobDescription deve ser executada de forma independente, com intervalos configuráveis:
- **jobList**: Varredura dos portais a cada 6 horas
- **jobDescription**: Processamento da fila com intervalo de 1 segundo entre leituras

## Abstração de Técnicas de Extração

Cada portal pode utilizar técnicas distintas de scrape conforme sua complexidade (paginação por scroll, botão, cURL, autenticação, etc.). Para garantir consistência, todos os portais devem implementar uma interface padrão:
- `extractList()`: Extrai a lista de vagas (jobList)
- `extractDeep()`: Extrai detalhes da vaga (jobDescription)

Essa abordagem permite adicionar novos portais mantendo os pontos de chamada uniformes, independentemente da técnica de scrape utilizada.
"

---

## Context & Continuity

> [!IMPORTANT]
> **Principal Architecture**: The specification `002-frontend-v2-architecture` is the primary and principal architectural foundation of this project. All technical decisions, coding patterns, and infrastructure choices (such as the core frameworks, database patterns, and the Service Layer abstraction) defined in `002` MUST be strictly followed for this job scraper worker. This spec (`003`) is a feature extension and does not override the core architectural rules established in `002`.

## Clarifications

- **Q: How should Admin Settings routes and worker control endpoints be protected?**  
  → **A:** Inherited session auth — reuse the existing auth middleware already protecting the rest of the app.
- **Q: How should the frontend receive real-time scrape task progress updates?**  
  → **A:** SSE (Server-Sent Events) — the worker persists state to the DB; the server holds an SSE connection open with the client (`text/event-stream`) and pushes an event on each state change. The browser uses the native `EventSource` API. WebSocket is not needed as communication is unidirectional (server → client only).
- **Q: Should the scraper respect `robots.txt` and Terms of Service restrictions?**  
  → **A:** Informational + manual — the system checks `robots.txt` on portal registration and stores the result as `isRobotsBlocked` on the portal record. This flag is displayed in the Admin UI alongside the enable/disable toggle so the admin is informed. The worker does NOT auto-block based on this flag; the decision is entirely manual. A configurable identifiable `User-Agent` is sent on all requests.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Background Dual-Scraping (Priority: P1)

As a system, I want to automatically run scraping tasks in the background at regular intervals so that the job database is continuously updated with both new job listings and their full descriptions without blocking the user interface.

**Why this priority**: A self-updating job database is essential for the copilot matching feature. Doing the deep scrape (fetching the full description) automatically ensures we don't discard highly compatible jobs just because their titles were vague.

**Independent Test**: Can be fully tested by configuring a background schedule, letting it run, and verifying that both new basic job entries and their full descriptions are saved to the database, while the web UI remains perfectly responsive.

**Acceptance Scenarios**:

1. **Given** the background worker is active, **When** the jobList schedule triggers (every 6 hours), **Then** it iterates through active portal search configurations, executes `extractList()` (Step 1), and enqueues Step 2 tasks for newly found job listing URLs.
2. **Given** a Step 2 task is running, **When** the description queue worker processes a pending job description (leaving at least a 1-second delay between requests), **Then** it extracts the full job description using the portal's `extractDeep()` strategy.
3. **Given** a job has completed Step 1 but is pending Step 2, **When** the user attempts to view its description in the UI, **Then** the UI displays a clear placeholder message (e.g., "The description for this application will be available shortly, please check back later.") and indicates the pending status in the job list.

---

### User Story 2 - Synchronous Scraper Tester (Priority: P1)

As a admin user/developer, I want to manually test a scraper strategy against a specific URL and immediately see the extracted JSON results on the screen, so I can validate if a portal's structure is working before adding it to the background worker.

**Why this priority**: Testing scraper logic in the background is slow and blind. A synchronous playground allows instant validation.

**Independent Test**: Can be fully tested by selecting a Strategy and Logic (List/Description), providing a URL, and clicking "Run Test". The raw JSON should appear immediately. If testing a List URL, an "Add to Worker" button should appear to save it to the database.

**Acceptance Scenarios**:

1. **Given** I am in the Admin Settings (`/settings/portals`), **When** I use the "Scraper Tester" block to test a URL, **Then** a synchronous request is made to a test endpoint (`/api/scrape/test`) and the extracted JSON data is rendered on the screen.
2. **Given** a successful test of a "Job List" URL, **When** I click "Add to Worker", **Then** a modal opens asking for a friendly name, and upon submission, the URL is saved to the database for the background worker to pick up.

---

### User Story 3 - Portal Search Management and Deduplication (Priority: P1)

As a system administrator, I want to manage multiple search URLs for enabled portals in the Admin Settings so that the background worker can scan different keywords and filters automatically, without me needing to manually code each search variation.

**Why this priority**: The system must be able to adapt to different search needs. The core extraction logic is implemented offline by developers, meaning the web system only needs to manage which URLs of those supported portals should be actively monitored.

**Independent Test**: Can be fully tested by adding multiple distinct URLs for an enabled portal in the Admin Panel, running the worker, and verifying that jobs from all URLs are extracted and deduplicated properly.

**Acceptance Scenarios**:

1. **Given** a portal is enabled in the system codebase, **When** I access the Admin Settings via the `/settings/portals` sub-navigation, **Then** I can add, enable, disable, or remove specific search URLs for that portal.
2. **Given** multiple URLs are configured for the same portal (e.g. different keywords), **When** the worker scrapes them, **Then** the system deduplicates the results (e.g., by unique job ID or URL) to ensure the same job is not saved multiple times in the database.
3. **Given** a portal's structure changes, **When** extraction fails for a task after 3 consecutive attempts, **Then** the system automatically marks that portal configuration as "Broken" in the Admin UI.

---

### Edge Cases

- **Portal structure change or extraction failure**: If extraction fails (e.g., returns empty/invalid results or throws an error) after 3 attempts, the task is marked as `FAILED`, the associated portal configuration is flagged as "Broken", and subsequent automated runs for that configuration are skipped. The "Broken" state is visually flagged in the Admin UI so developers know to update the strategy.
- **Anti-bot protection (e.g., Cloudflare, CAPTCHAs)**: If the system receives a blocked/challenge response (e.g., HTTP 403, redirect to CAPTCHA page), the task is marked as `FAILED` with a reason of `BLOCKED`. No retry is attempted automatically. An alert is shown in the Admin UI so the administrator is aware. The portal is NOT marked as "Broken" since this is an access issue, not a selector issue.
- **Worker crash during Step 2**: On application restart, the worker MUST query for any tasks left in a `RUNNING` state and reset them to `PENDING`. This ensures the interrupted scraping run is picked up again automatically on the next polling cycle, guaranteeing at-least-once processing.
- **Rate limiting (HTTP 429)**: If the target portal returns an HTTP 429 response, the worker MUST NOT immediately retry. It MUST apply exponential backoff with jitter (starting at 30 seconds, doubling each attempt, up to a configurable maximum of 5 minutes) before re-queuing the task. The failure count for this task is incremented. If 429 responses persist after 3 backoff attempts, the task is marked `FAILED` with reason `RATE_LIMITED`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement an asynchronous background worker using a database-backed queue. This avoids adding new infrastructure dependencies while operating independently from the main API thread.
- **FR-002**: System MUST implement independent execution loops/workers:
  - **Job List Worker (Step 1)**: Runs every 6 hours (configurable interval) to execute `extractList()` on active portal search URLs. It extracts basic metadata (Title, Company, URL, Location, LocationType, JobType, Countries, postedAt, salary details) and creates job listing records in the database.
  - **Job Description Queue Worker (Step 2)**: Processes a queue of pending job description tasks by visiting each URL and executing `extractDeep()`, leaving a 1-second delay (configurable rate-limit delay) between readings. The extracted HTML is converted to clean Markdown (e.g., via `turndown`) to preserve structure while stripping dangerous/bloated tags.
  - **Exception**: Portals that already deliver the full description in `extractList()` (Step 1) MUST mark the job as having its description fetched (`isFullDescriptionFetched = true`), bypassing the queue for Step 2.
- **FR-003**: System MUST implement standard interface methods (`extractList()` and `extractDeep()`) per portal, permitting any extraction technique (such as CSS selectors, Puppeteer, cURL, or encapsulated AI models if all other techniques fail) as long as it adheres to the uniform interface. The raw JSON payloads MUST be savable to the file system (e.g., `/debug/scraper/`) for developer inspection.
- **FR-004**: System MUST provide an Admin Settings sub-navigation (`/settings/portals`) allowing administrators to add, toggle, or remove specific search URLs for any natively enabled portal.
  - **Admin Settings Configuration Options** (manageable via UI):
    - Global Scrape Interval (minutes between automated runs)
    - Rate Limit Delay (milliseconds to wait between requests)
    - Max Extraction Retries (reading attempts before flagging the portal configuration as Broken, default is 3)
- **FR-005**: System MUST implement a deduplication mechanism to ensure that jobs fetched from multiple URLs (or previous scrapes) are not duplicated in the database (e.g., using a composite unique key of portal + external job ID).
- **FR-006**: System MUST provide a synchronous "Scraper Tester" API endpoint (`POST /api/scrape/test`) that accepts a URL, Strategy ID, and Logic Type (List/Description), executes the extraction logic immediately, and returns the parsed JSON payload without saving it to the database. The UI MUST use this to allow developers to test strategies and add successful List URLs to the system via a modal.
- **FR-007**: System MUST implement a task retry and failure-handling mechanism:
  - **Task-Level Retries**: Each task (reading a search list or an individual description page) is attempted up to 3 times (reading attempts) on failure.
  - **Broken State Signaling**: If a task fails all 3 attempts, the task status is set to `FAILED` and its corresponding portal configuration (`PortalSearchUrl`) is flagged as `BROKEN` in the database.
  - **No Engine-Level AI Fallback**: The scraping engine MUST NOT automatically invoke or route failed tasks to an AI/LLM fallback service. Any custom AI-based extraction must be encapsulated as an internal implementation detail inside a portal's specific `extractList()` or `extractDeep()` code, not as a system-level automatic fallback.
- **FR-008**: System MUST implement rate limiting in the worker, including exponential backoff for HTTP 429 responses. These parameters MUST be configurable and manageable through the Admin Settings UI to adapt to each portal's limits without requiring code deployments.
- **FR-009**: System MUST track the status of scrape tasks (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`) by persisting every state transition to the database queue. The server MUST expose an SSE endpoint (`text/event-stream`) that holds a persistent HTTP connection open with the client and pushes a structured event payload on each task state change. The browser consumes this via the native `EventSource` API. This is a server-push (unidirectional) model — no polling or WebSocket is required.
- **FR-010**: All Admin Settings routes (`/settings/portals`) and worker control API endpoints MUST be protected by the same session-based authentication middleware already in use across the rest of the application. No separate API-key or additional auth layer is required.
- **FR-011**: On portal registration (and on-demand refresh), the system MUST fetch and parse the portal's `robots.txt` and store the result as `isRobotsBlocked` (boolean) on the `PortalSearchUrl` record. This flag is **informational only** — it is displayed in the Admin Settings UI alongside each portal's enable/disable toggle so the administrator can make an informed decision. The worker does **not** automatically block or skip scraping based on this flag; enabling or disabling a portal remains a fully manual administrator action. All outbound HTTP requests MUST include a configurable, identifiable `User-Agent` header (manageable via Admin Settings).

### Key Entities

- **ScrapeTask**: Tracks the lifecycle of a single background job (list or deep scrape), including its status, progress, and the original trigger context (search URL, keywords, location for manual tasks).
- **PortalSearchUrl**: An admin-managed entry linking an enabled portal to a specific search URL. Tracks whether the portal is `ACTIVE`, `BROKEN`, or `DISABLED`. Includes an `isRobotsBlocked` (boolean) flag — set automatically by checking `robots.txt` on registration — surfaced in the Admin UI as an informational warning alongside the enable/disable toggle.
- **JobListing**: The global job store populated by the scraper. Tracks title, company, url, and optional basic metadata (locationType, jobType, countries, experienceLevel, postedAt, salary ranges) and the full description text (converted to clean Markdown). Tracks whether the full description has been fetched (`isFullDescriptionFetched`) and enforces deduplication via a unique constraint.
- **SystemConfig**: Stores global worker configuration values (scrape interval, concurrency, rate limits, max retries, User-Agent header). Managed via the Admin Settings page.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Background worker scrapes and processes 100 job listings (Step 1 + Step 2) in under 3 minutes per portal (excluding portals using AI within their custom extraction logic).
- **SC-002**: UI latency and navigation performance remains unaffected (0 degradation) while the worker processes heavy scraping tasks in the background.
- **SC-003**: Extraction success rate targets ≥95% of scraping attempts under normal operation.
  > [!NOTE]
  > Measurement of this criterion is tracked informally via worker logs (Winston) and the "Broken" portal status in the Admin UI. A future backlog item will formalize this metric under a separate system.
- **SC-004**: 100% of jobs saved in the database have their full descriptions attached (or explicitly flagged as pending description extraction), preventing incomplete records from reaching downstream matching or tracking stages.

---

## Assumptions

- We will use a database-backed queue for the background worker architecture to avoid new infrastructure overhead.
- Portals do not actively block standard HTML requests unless abused with high concurrency.
- The user will maintain/update the extraction rules if a portal undergoes a major redesign.
- Local resources are sufficient to run the background worker alongside the main application server.
