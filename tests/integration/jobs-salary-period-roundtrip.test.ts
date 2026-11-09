/**
 * @jest-environment node
 */
import "dotenv/config";
import { runClassificationWorker } from "@/lib/workers/classification-worker";
import { GET as getJobsHandler } from "@/app/api/jobs/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";
import {
  classifyJobListing,
  canonicalizeJobFacts,
} from "@/services/jobClassificationService";

jest.mock("@/lib/auth/auth", () => ({ auth: jest.fn() }));
jest.mock("@/services/jobClassificationService", () => ({
  classifyJobListing: jest.fn(),
  canonicalizeJobFacts: jest.fn(),
}));
jest.mock("@/lib/ai/vector-service", () => ({
  ...jest.requireActual("@/lib/ai/vector-service"),
  generateEmbedding: jest.fn(),
}));
jest.mock("@/lib/ai/circuit-breaker", () => ({
  ...jest.requireActual("@/lib/ai/circuit-breaker"),
  isProviderBlocked: jest.fn().mockResolvedValue(false),
  withCircuitBreaker: jest.fn(
    async (_key: string, _provider: string, fn: () => Promise<unknown>) => fn(),
  ),
}));
jest.mock("@/lib/ai/aiClient", () => ({
  ...jest.requireActual("@/lib/ai/aiClient"),
  resolveAIConfig: jest
    .fn()
    .mockResolvedValue({ provider: "gemini", model: "test-model" }),
}));

import { generateEmbedding } from "@/lib/ai/vector-service";

// APC-44 follow-up: real worker raw-SQL write (::jsonb) -> real /api/jobs read, asserting the
// jobFacts.salaryPeriod tri-state survives the database round trip. Only AI/embedding calls are
// mocked; Prisma is real (applycopilot_dev). The worker's candidate query is narrowed to the
// test rows so unrelated PENDING dev rows are never touched.
describe("salaryPeriod worker write -> /api/jobs read round trip (APC-44)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const run = `${Date.now()}-${Math.random()}`;
  const testEmail = `salary-roundtrip-${Date.now()}@example.com`;
  const keys = ["stated", "unknown", "absent"] as const;
  const ids: Record<(typeof keys)[number], string> = {
    stated: "",
    unknown: "",
    absent: "",
  };
  let userId = "";

  const baseFacts = {
    mustHave: ["React"],
    niceToHave: [],
    softSkills: [],
    seniority: null,
    yearsExperienceMin: null,
    employmentType: null,
    workMode: null,
    isWorldwide: null,
    requiresUsWorkAuth: null,
    providesRelocationVisa: null,
    location: null,
    salaryMin: 40,
    salaryMax: 60,
    currency: "USD",
  };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Round", lastName: "Trip" } },
      },
    });
    userId = user.id;
    for (const key of keys) {
      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `salary-roundtrip-${key}-${run}`,
          title: `Round Trip ${key}`,
          company: "Test Company",
          url: "https://example.com/job",
          fullDescription: "Example description",
          isFullDescriptionFetched: true,
          classificationStatus: "PENDING",
        },
      });
      ids[key] = job.id;
    }
  });

  afterAll(async () => {
    await safeCleanup("roundtrip jobListings", async () => {
      await prisma.jobListing.deleteMany({
        where: { id: { in: Object.values(ids).filter(Boolean) } },
      });
    });
    await safeCleanup("roundtrip user", async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    await prisma.$disconnect();
    await pool.end();
  });

  it("persists stated/unknown/absent periods through the worker and returns them from /api/jobs", async () => {
    const byTitle: Record<string, Record<string, unknown>> = {
      "Round Trip stated": { ...baseFacts, salaryPeriod: "hourly" },
      "Round Trip unknown": { ...baseFacts },
      "Round Trip absent": { ...baseFacts, salaryMin: null, salaryMax: null, currency: null },
    };
    (classifyJobListing as jest.Mock).mockImplementation(
      async (input: { title: string }) => ({ jobFacts: byTitle[input.title] }),
    );
    (canonicalizeJobFacts as jest.Mock).mockImplementation(async (f: unknown) => f);
    (generateEmbedding as jest.Mock).mockResolvedValue(
      Array.from({ length: 768 }, () => 0.01),
    );

    // Narrow the worker's candidate query to our rows only (first call), then drain.
    const realFindMany = prisma.jobListing.findMany.bind(prisma.jobListing);
    let served = false;
    const spy = jest
      .spyOn(prisma.jobListing, "findMany")
      .mockImplementation(((args: Parameters<typeof realFindMany>[0]) => {
        if (args?.where && "classificationStatus" in (args.where as object) && args.select) {
          if (served) return Promise.resolve([]);
          served = true;
          return realFindMany({
            ...args,
            where: { ...(args.where as object), id: { in: Object.values(ids) } },
          });
        }
        return realFindMany(args);
      }) as typeof prisma.jobListing.findMany);

    try {
      await runClassificationWorker();
    } finally {
      spy.mockRestore();
    }

    mockAuth.mockResolvedValue({
      user: { id: userId, email: testEmail, role: "USER" },
      expires: "any",
    });
    const res = await getJobsHandler(
      new Request("http://localhost:3000/api/jobs?days=3650&limit=100"),
    );
    expect(res.status).toBe(200);
    const jobs = (await res.json()) as Array<{
      id: string;
      jobFacts: Record<string, unknown> | null;
    }>;
    const byId = new Map(jobs.map((j) => [j.id, j]));

    const stated = byId.get(ids.stated)!.jobFacts!;
    expect(stated.salaryPeriod).toBe("HOURLY");
    expect(stated.salaryMin).toBe(40);

    // Worker always persists an explicit key: unknown must round-trip as null, never absent.
    const unknown = byId.get(ids.unknown)!.jobFacts!;
    expect("salaryPeriod" in unknown).toBe(true);
    expect(unknown.salaryPeriod).toBeNull();

    const noSalary = byId.get(ids.absent)!.jobFacts!;
    expect(noSalary.salaryPeriod).toBeNull();
    expect(noSalary.salaryMin).toBeNull();
  });
});
