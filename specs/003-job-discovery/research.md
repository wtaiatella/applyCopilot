# Research: Job Discovery & Scraper Worker

## 1. Background Worker Architecture (No Redis)

**Context**: Spec 003 requires a background worker that operates independently from the main API thread. We must avoid adding new infrastructure dependencies (like Redis) and use a PostgreSQL-backed queue via Prisma, as per the architecture guidelines.

**Decision**: Use a custom polling loop initialized via Next.js `instrumentation.ts` (or a dedicated worker thread) running in the background.
**Rationale**:
- The project targets a Docker/bare-metal deployment (per Constitution), meaning we do not suffer from Vercel's serverless execution timeouts.
- Next.js `instrumentation.ts` allows us to bootstrap a background loop (`setInterval` or a custom queue processor loop) exactly once when the Node.js server starts.
- A Prisma-backed `ScrapeTask` table will act as the queue. The worker queries for tasks where `status = PENDING`, marks them `RUNNING`, processes them, and updates to `COMPLETED` or `FAILED`.
- Since we have two independent loops:
  - **Job List Worker (Step 1)**: Runs every 6 hours (configurable, defaulting to 360 minutes) to query `PortalSearchUrl` and schedule/execute list scrapes.
  - **Job Description Queue Worker (Step 2)**: Processes individual job descriptions with a 1-second delay between requests (defaulting to 1000ms).
**Alternatives considered**:
- `BullMQ/Redis`: Rejected due to introducing a new infra dependency.
- `pg-boss`: Overkill for our simple queue needs and requires extra setup compared to a native Prisma polling loop.

## 2. Scraping and DOM Extraction

**Context**: Need a uniform extraction interface supporting various techniques (cheerio DOM selectors, Puppeteer, cURL, or local AI fallback internally inside a strategy) while maintaining consistency.

**Decision**: Implement a `ScraperStrategy` interface with `extractList()` and `extractDeep()` methods. Portals are implemented as isolated modules registered under a registry.
**Rationale**:
- Cheerio is the default lightweight DOM extractor, which handles standard static HTML very fast without browser overhead.
- Portals that require client-side JS rendering or advanced anti-bot handling can encapsulate their own scraper logic (e.g. headless browsers or Puppeteer) inside their specific implementation of the interface, keeping the core worker engine simple and uniform.
**Alternatives considered**:
- Direct Puppeteer engine: Too heavy to use globally for all boards. The strategy pattern lets us opt-in to heavier tools only for portals that require it.

## 3. HTML to Markdown Conversion (Step 2)

**Context**: During Step 2 (Deep Scrape), raw HTML job descriptions from portals often contain malicious scripts, inline styles, tracking pixels, and bloated tags. Storing raw HTML or raw text has drawbacks.

**Decision**: Use `turndown` to convert HTML job descriptions to Markdown during Step 2.
**Rationale**:
- **Preserves Structure**: Markdown retains headings (`#`), lists (`*`), and bold/italics, which our UI can easily render using standard markdown renderers.
- **Sanitization via Stripping**: Turndown strips `<script>`, `<style>`, and most non-typographical tags by default, making it much safer to store than raw HTML.
- **Cost Friendly**: Stripped Markdown is significantly cheaper to process in later stages (such as vector embeddings or AI job classification).
**Alternatives considered**:
- `cheerio.text()`: Too destructive (removes newlines from lists/paragraphs, producing a single dense block of text).
- `sanitize-html`: Keeps HTML which can break UI styling and layout, and consumes more database storage.

## 4. Real-time UI Updates (SSE)

**Context**: The frontend needs real-time feedback when a manual scrape is queued and running in the background.

**Decision**: Use Server-Sent Events (SSE).
**Rationale**:
- Already established in the architecture (spec 002) for CV parsing.
- Avoids WebSocket infrastructure overhead while providing true real-time server-to-client streaming.
- The server holds an HTTP SSE stream (`text/event-stream`) open and pushes event payloads when a manual task changes state.
**Alternatives considered**:
- Short-polling: Inefficient and adds unnecessary load to the database.
