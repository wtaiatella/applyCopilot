/**
 * @jest-environment node
 */
import { prisma } from "@/lib/db/prisma";
import { runTask } from "@/lib/scraper/engine";
import * as engineModule from "@/lib/scraper/engine";
import "@/lib/scraper/portals/example";

beforeAll(() => {
  jest.spyOn(global, "fetch").mockImplementation(async (url: any) => {
    if (url.includes("dedup")) {
      return {
        ok: true,
        text: async () => `
          <div class="job-card" data-job-id="dedup-1">
            <h2 class="title">Duplicate Job</h2>
            <span class="company">Unique Corp</span>
            <a class="job-link" href="https://example.com/jobs/dedup-1">Apply</a>
          </div>
        `,
      } as Response;
    }
    return {
      ok: true,
      text: async () => "",
    } as Response;
  });
});

describe("Scraper Engine - Deduplication & runTask Integration", () => {
  beforeEach(async () => {
    await prisma.scrapeTask.deleteMany();
    await prisma.jobListing.deleteMany();
    await prisma.portalSearchUrl.deleteMany();
  });

  afterAll(async () => {
    await prisma.scrapeTask.deleteMany();
    await prisma.jobListing.deleteMany();
    await prisma.portalSearchUrl.deleteMany();
    await prisma.$disconnect();
    const { pool } = await import("@/lib/db/prisma");
    await pool.end();
  });

  it("should successfully deduplicate identical external job IDs during runTask execution", async () => {
    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "PENDING",
        searchUrl: "https://example.com/dedup-search",
      },
    });

    // First list extraction run
    await runTask(task.id);

    let count = await prisma.jobListing.count({
      where: { portalId: "example", externalJobId: "dedup-1" },
    });
    expect(count).toBe(1);

    // Create a new search task to simulate a subsequent automated cycle
    const secondTask = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "PENDING",
        searchUrl: "https://example.com/dedup-search",
      },
    });

    // Second list extraction run
    await runTask(secondTask.id);

    // The database count for this job listing must remain exactly 1 due to deduplication
    count = await prisma.jobListing.count({
      where: { portalId: "example", externalJobId: "dedup-1" },
    });
    expect(count).toBe(1);
  });
});
