/**
 * Standalone scraper load test (REM-17, spectech.md FR-17/AC.17, SC-001).
 *
 * Deliberately OUTSIDE jest.config.js's `testMatch` — this is not a Jest test file, it is a
 * runnable script: `npx tsx tests/perf/load-scraper.ts`.
 *
 * Seeds 100 mock listings per currently-registered scraper portal (`example`, `workable`),
 * runs the real `runTask()` engine against them, and asserts the combined run completes in
 * under 3 minutes (SC-001). The underlying `fetch` used by `fetchHtml` is replaced with an
 * in-memory fixture responder for the duration of the run — this script must never make a
 * real network call to any external job portal (mirrors the mocking approach already
 * established in tests/integration/scraper/engine.test.ts).
 *
 * Uses the real local database (via `../../src/lib/db/prisma`, same as prisma/seed.ts and
 * src/scripts/*.ts) — rows created by this run are deleted again before it exits.
 */
import "dotenv/config";
import { prisma } from "../../src/lib/db/prisma";
import { runTask } from "../../src/lib/scraper/engine";
import { getAllStrategies } from "../../src/lib/scraper/registry";
// Importing each portal module for its side-effecting `registerStrategy(...)` call — mirrors
// how tests/integration/scraper/engine.test.ts registers the "example" strategy.
import "../../src/lib/scraper/portals/example";
import "../../src/lib/scraper/portals/workable";

const LISTINGS_PER_PORTAL = 100;
const THRESHOLD_MS = 3 * 60 * 1000; // SC-001: "under 3 minutes"
const EXTERNAL_ID_PREFIX = "loadtest-";

function buildExampleHtml(count: number): string {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="job-card" data-job-id="${EXTERNAL_ID_PREFIX}example-${i}">
        <h2 class="title">Load Test Engineer ${i}</h2>
        <span class="company">Load Test Corp</span>
        <span class="location">Remote</span>
        <a class="job-link" href="https://example.com/jobs/${EXTERNAL_ID_PREFIX}example-${i}">Apply</a>
      </div>`;
  }
  return html;
}

function buildWorkableJson(count: number): string {
  // Raw-JSON branch of workableStrategy.extractList (`cleanHtml.startsWith("{")`).
  const jobs = Array.from({ length: count }, (_, i) => ({
    id: `${EXTERNAL_ID_PREFIX}workable-${i}`,
    title: `Load Test Engineer ${i}`,
    company: { title: "Load Test Corp" },
    url: `https://jobs.workable.com/view/${EXTERNAL_ID_PREFIX}workable-${i}`,
    locations: ["Remote"],
    workplace: "remote",
    employmentType: "full",
    created: new Date().toISOString(),
  }));
  return JSON.stringify({ jobs, nextPageToken: "" });
}

const FIXTURES: Record<string, string> = {
  example: buildExampleHtml(LISTINGS_PER_PORTAL),
  workable: buildWorkableJson(LISTINGS_PER_PORTAL),
};

async function main() {
  const registeredPortalIds = getAllStrategies().map((s) => s.portalId);
  const portalIds = registeredPortalIds.filter((id) => id in FIXTURES);
  if (portalIds.length === 0) {
    throw new Error(
      "No known scraper strategy registered — expected 'example' and/or 'workable'. " +
        `Registered: ${registeredPortalIds.join(", ") || "(none)"}`,
    );
  }

  const originalFetch = global.fetch;
  // Never reaches a real portal — every call is answered from the in-memory fixtures above,
  // matching the mocking approach already used by tests/integration/scraper/engine.test.ts.
  global.fetch = (async (url: RequestInfo | URL) => {
    const portalId = String(url).includes("workable.com")
      ? "workable"
      : "example";
    return {
      ok: true,
      status: 200,
      redirected: false,
      url: String(url),
      text: async () => FIXTURES[portalId] ?? "",
    } as Response;
  }) as typeof fetch;

  const taskIds: string[] = [];
  const results: { portalId: string; ms: number; jobsAdded: number }[] = [];

  try {
    for (const portalId of portalIds) {
      const searchUrl =
        portalId === "workable"
          ? "https://jobs.workable.com/search?query=load-test"
          : "https://example.com/search?query=load-test";

      const task = await prisma.scrapeTask.create({
        data: { type: "LIST", portalId, status: "PENDING", searchUrl },
      });
      taskIds.push(task.id);

      const start = Date.now();
      await runTask(task.id);
      const ms = Date.now() - start;

      const jobsAdded = await prisma.jobListing.count({
        where: {
          portalId,
          externalJobId: { startsWith: `${EXTERNAL_ID_PREFIX}${portalId}-` },
        },
      });

      results.push({ portalId, ms, jobsAdded });
    }
  } finally {
    global.fetch = originalFetch;

    // Cleanup: only rows this run itself created.
    if (taskIds.length) {
      await prisma.scrapeTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    for (const portalId of portalIds) {
      await prisma.jobListing.deleteMany({
        where: {
          portalId,
          externalJobId: { startsWith: `${EXTERNAL_ID_PREFIX}${portalId}-` },
        },
      });
    }
    await prisma.$disconnect();
    const { pool } = await import("../../src/lib/db/prisma");
    await pool.end();
  }

  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
  const allExtracted = results.every(
    (r) => r.jobsAdded === LISTINGS_PER_PORTAL,
  );
  const pass = totalMs < THRESHOLD_MS && allExtracted;

  console.log("\n=== Scraper Load Test (REM-17, SC-001: under 3 minutes) ===");
  for (const r of results) {
    console.log(
      `  ${r.portalId}: ${r.jobsAdded}/${LISTINGS_PER_PORTAL} listings extracted in ${r.ms}ms`,
    );
  }
  console.log(`  Total: ${totalMs}ms (threshold: ${THRESHOLD_MS}ms)`);
  console.log(`  RESULT: ${pass ? "PASS" : "FAIL"}`);
  console.log(
    "=============================================================\n",
  );

  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => {
  console.error("[load-scraper] Fatal error:", err);
  process.exitCode = 1;
});
