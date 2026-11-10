/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getJobsHandler } from "@/app/api/jobs/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// APC-44 T016: jobFacts.salaryPeriod is passed through the jobs DTO unchanged (tri-state).
describe("GET /api/jobs - jobFacts.salaryPeriod tri-state passthrough (APC-44)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `jobs-salary-period-${Date.now()}@example.com`;
  const run = `${Date.now()}-${Math.random()}`;
  let userId: string;
  const ids: Record<"legacy" | "nul" | "hourly", string> = {
    legacy: "",
    nul: "",
    hourly: "",
  };

  const baseFacts = {
    mustHave: [],
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

  async function createJob(key: keyof typeof ids, facts: object) {
    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `salary-period-${key}-${run}`,
        title: `Salary Period ${key}`,
        company: "Test Company",
        url: "https://example.com/job",
        classificationStatus: "COMPLETED",
        jobFacts: facts,
      },
    });
    ids[key] = job.id;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Salary", lastName: "Tester" } },
      },
    });
    userId = user.id;
    await createJob("legacy", baseFacts);
    await createJob("nul", { ...baseFacts, salaryPeriod: null });
    await createJob("hourly", { ...baseFacts, salaryPeriod: "HOURLY" });
  });

  afterAll(async () => {
    await safeCleanup("jobs-salary-period jobListings", async () => {
      await prisma.jobListing.deleteMany({
        where: { id: { in: Object.values(ids).filter(Boolean) } },
      });
    });
    await safeCleanup("jobs-salary-period user", async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    await prisma.$disconnect();
    await pool.end();
  });

  it("omits the key for legacy facts, keeps null, passes a stated value", async () => {
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

    const legacy = byId.get(ids.legacy)!.jobFacts!;
    expect("salaryPeriod" in legacy).toBe(false);
    expect(legacy.salaryMin).toBe(40);

    const nul = byId.get(ids.nul)!.jobFacts!;
    expect("salaryPeriod" in nul).toBe(true);
    expect(nul.salaryPeriod).toBeNull();

    expect(byId.get(ids.hourly)!.jobFacts!.salaryPeriod).toBe("HOURLY");
  });
});
