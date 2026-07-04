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
2. Implement the standard interface, defining the strategies for:
   - `extractList()`: extracts the job listings and basic metadata.
   - `extractDeep()`: visits individual job pages and returns the full job description.
3. Register the portal in `src/lib/scraper/registry.ts`.
4. Go to the Admin Settings (`/settings/portals`) in the web UI and add a search URL for your new portal to see it run in the background.
