/**
 * @jest-environment node
 */
import { prisma } from "@/lib/db/prisma";
import { scheduleListTasks, enqueueDeepTasks } from "@/lib/scraper/queue";
import { handleTaskFailure } from "@/lib/scraper/engine";

describe("Scraper Queue Manager & Engine Integration", () => {
  beforeEach(async () => {
    // Clear scraper related tables to ensure test isolation
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

  it("should schedule a LIST task for active configs", async () => {
    // Create active portal search URL
    const config = await prisma.portalSearchUrl.create({
      data: {
        portalId: "example",
        name: "Example Search",
        url: "https://example.com/jobs",
        isActive: true,
        status: "ACTIVE",
      },
    });

    await scheduleListTasks();

    // Check if task was scheduled
    const tasks = await prisma.scrapeTask.findMany({
      where: { portalId: "example", type: "LIST" },
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].searchUrl).toBe(config.url);
    expect(tasks[0].status).toBe("PENDING");
  });

  it("should not schedule a LIST task if configuration is BROKEN or DISABLED", async () => {
    await prisma.portalSearchUrl.create({
      data: {
        portalId: "example",
        name: "Broken Portal",
        url: "https://example.com/broken",
        isActive: true,
        status: "BROKEN",
      },
    });

    await scheduleListTasks();

    const tasks = await prisma.scrapeTask.findMany({
      where: { portalId: "example", type: "LIST" },
    });

    expect(tasks).toHaveLength(0);
  });

  it("should enqueue a DEEP task for job listings missing full descriptions", async () => {
    await prisma.jobListing.create({
      data: {
        portalId: "example",
        externalJobId: "job-99",
        title: "Example Title",
        company: "Example Company",
        url: "https://example.com/jobs/job-99",
        isFullDescriptionFetched: false,
      },
    });

    await enqueueDeepTasks();

    const tasks = await prisma.scrapeTask.findMany({
      where: { portalId: "example", type: "DEEP" },
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].searchUrl).toBe("https://example.com/jobs/job-99");
    expect(tasks[0].status).toBe("PENDING");
  });

  it("should retry task if attempts < maxRetries", async () => {
    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "RUNNING",
        attempts: 0,
      },
    });

    // Run failure handler
    await handleTaskFailure(task, "Network connection timeout");

    const updatedTask = await prisma.scrapeTask.findUnique({
      where: { id: task.id },
    });

    expect(updatedTask?.status).toBe("PENDING");
    expect(updatedTask?.attempts).toBe(1);
    expect(updatedTask?.errorMessage).toBe("Network connection timeout");
  });

  it("should set task to FAILED and portal config to BROKEN on final retry failure", async () => {
    const portalUrl = "https://example.com/failed-run";
    const config = await prisma.portalSearchUrl.create({
      data: {
        portalId: "example",
        name: "Failing Search",
        url: portalUrl,
        isActive: true,
        status: "ACTIVE",
      },
    });

    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "RUNNING",
        attempts: 2, // 3rd attempt failing (nextAttempts = 3)
        searchUrl: portalUrl,
      },
    });

    await handleTaskFailure(task, "Anti-bot protection triggered");

    const updatedTask = await prisma.scrapeTask.findUnique({
      where: { id: task.id },
    });
    const updatedConfig = await prisma.portalSearchUrl.findUnique({
      where: { id: config.id },
    });

    expect(updatedTask?.status).toBe("FAILED");
    expect(updatedTask?.attempts).toBe(3);
    expect(updatedConfig?.status).toBe("BROKEN");
  });
});
