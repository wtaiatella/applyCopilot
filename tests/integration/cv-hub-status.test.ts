/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getJobCVStatusHandler } from "@/app/api/jobs/[id]/cv/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("GET /api/jobs/[id]/cv — hub status read-path (FR-19, AC.12)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-hub-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobNotStartedId: string;
  let jobDraftId: string;
  let jobAppliedId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Jane", lastName: "Doe" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const makeJob = (suffix: string) =>
      prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `test-job-hub-${suffix}-${Date.now()}`,
          title: `Engineer ${suffix}`,
          company: "Test Company",
          url: "https://example.com/job",
        },
      });

    const [jobNotStarted, jobDraft, jobApplied] = await Promise.all([
      makeJob("not-started"),
      makeJob("draft"),
      makeJob("applied"),
    ]);
    jobNotStartedId = jobNotStarted.id;
    jobDraftId = jobDraft.id;
    jobAppliedId = jobApplied.id;

    await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobDraftId,
        name: jobDraft.title,
        status: "DRAFT",
        snapshotData: {},
      },
    });

    await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobAppliedId,
        name: jobApplied.title,
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.jobListing
      .deleteMany({
        where: { id: { in: [jobNotStartedId, jobDraftId, jobAppliedId] } },
      })
      .catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  function makeRequest(jobId: string) {
    return getJobCVStatusHandler(
      new Request(`http://localhost:3000/api/jobs/${jobId}/cv`),
      { params: Promise.resolve({ id: jobId }) },
    );
  }

  it("returns not_started for a job with no CV", async () => {
    const res = await makeRequest(jobNotStartedId);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("not_started");
    expect(data.cvId).toBeNull();
  });

  it("returns draft for a job with a DRAFT CV", async () => {
    const res = await makeRequest(jobDraftId);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("draft");
    expect(data.cvId).toBeDefined();
  });

  it("returns applied for a job with an APPLIED CV", async () => {
    const res = await makeRequest(jobAppliedId);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("applied");
    expect(data.cvId).toBeDefined();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await makeRequest(jobNotStartedId);
    expect(res.status).toBe(401);
  });
});
