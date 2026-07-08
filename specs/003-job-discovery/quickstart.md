# Quickstart: Job Discovery & Scraper Worker

## 1. Prerequisites

Since this feature introduces new database tables, you must first apply the schema changes and generate the Prisma client.

```bash
cd frontend
npx prisma db push
npx prisma generate
```

## 2. Running the Worker

The background worker logic is embedded directly into the Next.js application lifecycle using the experimental `instrumentation.ts` file (or a similar bootstrapping method). 

This means that you do **not** need to run a separate Redis server or a separate worker process command.

Simply start the development server as usual:

```bash
cd frontend
npm run dev
```

### Note on local execution:
When the Next.js server boots up, the worker loop will initialize. It will periodically poll the `ScrapeTask` and `PortalSearchUrl` tables to execute background scraping automatically.
- **Job List Worker**: runs every 6 hours by default (configurable via `globalScrapeInterval` in `SystemConfig`).
- **Job Description Queue Worker**: processes queued jobs with a 1-second delay between requests (configurable via `rateLimitDelay` in `SystemConfig`).

## 3. Developing New Portal Selectors

To add support for a new portal (e.g., a new job board like Workable):

1. Create a new module in `src/lib/scraper/portals/[portal-name].ts`.
2. Implement the `ScraperStrategy` interface, defining the strategies for:
   - `extractList()`: extracts the job listings and basic metadata. (Optional: if the list page contains full descriptions, you can return them and set `isFullDescriptionFetched: true` to skip deep scraping!).
   - `extractDeep()`: visits individual job pages and returns the full job description.
3. Register the portal in `src/lib/scraper/registry.ts`.
4. Import the strategy file in `src/lib/scraper/queue.ts` and `src/app/api/scrape/test/route.ts` to trigger registration.

The **Workable Strategy** is implemented at `src/lib/scraper/portals/workable.ts`. It parses Next.js initial state script blocks on list pages, converts HTML descriptions to Markdown, and recursively paginates using Workable's public REST API until the final page, utilizing a `Set` to prevent duplicate pagination token loops.

---

## 4. Winston Logging, Auditing & Rate Limits

### Winston Logging (`T030`)
Logging is powered by Winston and configured in `src/lib/logging/logger.ts`. It supports:
- **`INFO`**: Logs HTTP GET requests to target URLs and task completions.
- **`DEBUG`**: Logs function entries/returns, parsed JobList details, and payload saving logs.
- **`WARN` / `ERROR`**: Logs failure retries, rate limits, and database insertion errors.
To enable debug logging to the console and to `debug/global.log`, set `LOG_LEVEL=debug` and `DEBUG_SAVE_EXTRACTED_TEXT=true` in your `.env`.

### Payload Auditing (`T031`)
When `LOG_LEVEL=debug`, the engine automatically saves raw crawler data to the `/debug/scraper/` folder:
- **Raw HTML**: Saved as `<timestamp>-<portalId>-list_html.html` or `deep_html.html`.
- **Parsed JSON**: Saved as `<timestamp>-<portalId>-list_result.json` or `deep_result.json` representing the exact object structure returned by the extractor strategy.

### Rate-Limiting Backoff (`T032`)
If a target portal returns an **HTTP 429** response:
1. The engine throws a `RateLimitError`.
2. The retry handler increments the task attempts and calculates an exponential backoff delay starting at 30 seconds, doubling each time (plus 0-5s jitter), up to a maximum of 5 minutes.
3. The task `createdAt` is shifted into the future by the backoff delay.
4. The queue scheduler query checks `createdAt: { lte: new Date() }`, skipping any rate-limited tasks until their backoff duration has fully elapsed.
5. If max retries are exceeded, the task is marked as `FAILED` and the matching portal config is marked as `BROKEN`.

