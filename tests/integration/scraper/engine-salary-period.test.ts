/**
 * @jest-environment node
 */
import "dotenv/config";
import { prisma, pool } from "@/lib/db/prisma";
import { runTask } from "@/lib/scraper/engine";
import type { ListResult } from "@/lib/scraper/engine";
import { registerStrategy } from "@/lib/scraper/registry";
import { safeCleanup } from "../helpers/test-fixtures";

// APC-44 T014/T017: engine upsert rule for JobListing.salaryPeriod.
const PORTAL_ID = "apc44-salary-period-test";
const RUN = `${Date.now()}`;
let nextResults: ListResult[] = [];

function item(suffix: string, extra: Partial<ListResult> = {}): ListResult {
  return {
    externalJobId: `apc44-${RUN}-${suffix}`,
    title: "Salary Period Job",
    company: "Test Co",
    url: `https://example.com/jobs/apc44-${RUN}-${suffix}`,
    ...extra,
  };
}

async function run(results: ListResult[]) {
  nextResults = results;
  const task = await prisma.scrapeTask.create({
    data: {
      type: "LIST",
      portalId: PORTAL_ID,
      status: "PENDING",
      searchUrl: "https://example.com/apc44-search",
    },
  });
  taskIds.push(task.id);
  await runTask(task.id);
}

async function stored(suffix: string) {
  return prisma.jobListing.findUniqueOrThrow({
    where: {
      portalId_externalJobId: {
        portalId: PORTAL_ID,
        externalJobId: `apc44-${RUN}-${suffix}`,
      },
    },
  });
}

const taskIds: string[] = [];

beforeAll(() => {
  registerStrategy({
    portalId: PORTAL_ID,
    extractList: () => nextResults,
    extractDeep: () => ({ fullDescription: "" }),
  });
  jest.spyOn(global, "fetch").mockImplementation(
    async () => ({ ok: true, text: async () => "<html></html>" }) as Response,
  );
});

afterAll(async () => {
  await safeCleanup("engine-salary-period taskIds", async () => {
    await prisma.scrapeTask.deleteMany({ where: { id: { in: taskIds } } });
  });
  await safeCleanup("engine-salary-period listings", async () => {
    await prisma.jobListing.deleteMany({ where: { portalId: PORTAL_ID } });
  });
  await prisma.$disconnect();
  await pool.end();
});

describe("Scraper engine - salaryPeriod persistence (APC-44)", () => {
  it("persists an hourly period on create (AC-1 storage)", async () => {
    await run([
      item("hourly", {
        salaryMin: 40,
        salaryMax: 60,
        currency: "USD",
        salaryPeriod: "HOURLY",
      }),
    ]);
    const row = await stored("hourly");
    expect(row.salaryPeriod).toBe("HOURLY");
    expect(row.salaryMin).toBe(40);
    expect(row.salaryMax).toBe(60);
  });

  it("persists a yearly range as YEARLY (AC-2 storage)", async () => {
    await run([
      item("yearly", {
        salaryMin: 90000,
        salaryMax: 120000,
        currency: "USD",
        salaryPeriod: "YEARLY",
      }),
    ]);
    const row = await stored("yearly");
    expect(row.salaryPeriod).toBe("YEARLY");
    expect(row.salaryMin).toBe(90000);
    expect(row.salaryMax).toBe(120000);
  });

  it("stores NULL when the period is omitted on create", async () => {
    await run([item("omitted", { salaryMin: 5000, currency: "USD" })]);
    expect((await stored("omitted")).salaryPeriod).toBeNull();
  });

  it("(i) update with salary data and no period replaces the stored period with NULL", async () => {
    await run([item("upd-i", { salaryMin: 40, salaryPeriod: "HOURLY" })]);
    expect((await stored("upd-i")).salaryPeriod).toBe("HOURLY");
    await run([item("upd-i", { salaryMin: 45 })]);
    const row = await stored("upd-i");
    expect(row.salaryMin).toBe(45);
    expect(row.salaryPeriod).toBeNull();
  });

  it("(ii) update with salary data and a period replaces the stored period", async () => {
    await run([item("upd-ii", { salaryMin: 40, salaryPeriod: "HOURLY" })]);
    await run([item("upd-ii", { salaryMax: 8000, salaryPeriod: "MONTHLY" })]);
    const row = await stored("upd-ii");
    expect(row.salaryPeriod).toBe("MONTHLY");
    expect(row.salaryMax).toBe(8000);
  });

  it("(iii) update with no salary data leaves the stored period untouched", async () => {
    await run([item("upd-iii", { salaryMin: 40, salaryPeriod: "HOURLY" })]);
    await run([item("upd-iii")]);
    const row = await stored("upd-iii");
    expect(row.salaryPeriod).toBe("HOURLY");
    expect(row.salaryMin).toBeNull();
  });

  it("treats a provided 0 as unstated and leaves the stored period untouched", async () => {
    await run([item("zero", { salaryMin: 40, salaryPeriod: "HOURLY" })]);
    await run([item("zero", { salaryMin: 0, salaryMax: 0 })]);
    const row = await stored("zero");
    expect(row.salaryPeriod).toBe("HOURLY");
    expect(row.salaryMin).toBeNull();
  });
});
