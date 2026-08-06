/**
 * @jest-environment node
 */
import { prisma } from "@/lib/db/prisma";
import { runTask } from "@/lib/scraper/engine";
import "@/lib/scraper/portals/example";

describe("Scraper Engine - Blocked (403/challenge) Failure Classification (REM-9)", () => {
  // Track only the rows this test file creates so cleanup never touches
  // pre-existing/real data (registered scraper URLs, job listings, etc.).
  let taskIds: string[] = [];
  let portalIds: string[] = [];

  afterEach(async () => {
    jest.restoreAllMocks();
    if (taskIds.length) {
      await prisma.scrapeTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    if (portalIds.length) {
      await prisma.portalSearchUrl.deleteMany({
        where: { id: { in: portalIds } },
      });
    }
    taskIds = [];
    portalIds = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
    const { pool } = await import("@/lib/db/prisma");
    await pool.end();
  });

  it("classifies 3 consecutive HTTP 403 responses as BLOCKED and leaves PortalSearchUrl.status unchanged", async () => {
    const portalUrl = "https://example.com/blocked-search";

    const config = await prisma.portalSearchUrl.create({
      data: {
        portalId: "example",
        name: "Blocked Search",
        url: portalUrl,
        isActive: true,
        status: "ACTIVE",
      },
    });
    portalIds.push(config.id);

    jest.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: false,
        status: 403,
        redirected: false,
        url: portalUrl,
        text: async () => "",
      } as Response;
    });

    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "PENDING",
        attempts: 0,
        searchUrl: portalUrl,
      },
    });
    taskIds.push(task.id);

    // 3 consecutive attempts, all blocked (HTTP 403)
    await runTask(task.id);
    await runTask(task.id);
    await runTask(task.id);

    const updatedTask = await prisma.scrapeTask.findUnique({
      where: { id: task.id },
    });
    const updatedConfig = await prisma.portalSearchUrl.findUnique({
      where: { id: config.id },
    });

    expect(updatedTask?.status).toBe("FAILED");
    expect(updatedTask?.attempts).toBe(3);
    expect(updatedTask?.errorMessage).toContain("Blocked");
    // The task must NOT be misclassified as a generic/broken failure.
    expect(updatedTask?.errorMessage).not.toContain("Rate limited");

    // Core assertion of REM-9: a block must never flip the portal config to BROKEN.
    expect(updatedConfig?.status).toBe("ACTIVE");
  });

  it("classifies a challenge-page redirect as BLOCKED and leaves PortalSearchUrl.status unchanged", async () => {
    const portalUrl = "https://example.com/redirect-search";
    const challengeUrl = "https://example.com/cf-challenge?id=1";

    const config = await prisma.portalSearchUrl.create({
      data: {
        portalId: "example",
        name: "Redirect Search",
        url: portalUrl,
        isActive: true,
        status: "ACTIVE",
      },
    });
    portalIds.push(config.id);

    jest.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        redirected: true,
        url: challengeUrl,
        text: async () => "",
      } as Response;
    });

    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "PENDING",
        attempts: 2, // 3rd attempt fails => permanent FAILED
        searchUrl: portalUrl,
      },
    });
    taskIds.push(task.id);

    await runTask(task.id);

    const updatedTask = await prisma.scrapeTask.findUnique({
      where: { id: task.id },
    });
    const updatedConfig = await prisma.portalSearchUrl.findUnique({
      where: { id: config.id },
    });

    expect(updatedTask?.status).toBe("FAILED");
    expect(updatedTask?.attempts).toBe(3);
    expect(updatedTask?.errorMessage).toContain("Blocked");
    expect(updatedConfig?.status).toBe("ACTIVE");
  });
});
