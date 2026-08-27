/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getListHandler } from "@/app/api/application-tracker/list/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("GET /api/application-tracker/list — consolidated List view read (009 US6, AC.9)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-tracker-list-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  let favoriteOnlyJobId: string;
  let analyzedOnlyJobId: string;
  let draftedJobId: string;
  let appliedJobId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "List", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const makeJob = (suffix: string) =>
      prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `test-job-list-${suffix}-${Date.now()}-${Math.random()}`,
          title: `Engineer ${suffix}`,
          company: "Test Company",
          url: "https://example.com/job",
          classificationStatus: "COMPLETED",
        },
      });

    const [favJob, analyzedJob, draftJob, appliedJob] = await Promise.all([
      makeJob("favorite-only"),
      makeJob("analyzed-only"),
      makeJob("drafted"),
      makeJob("applied"),
    ]);
    favoriteOnlyJobId = favJob.id;
    analyzedOnlyJobId = analyzedJob.id;
    draftedJobId = draftJob.id;
    appliedJobId = appliedJob.id;

    await prisma.jobFavorite.create({
      data: { profileId: testProfileId, jobListingId: favoriteOnlyJobId },
    });

    await prisma.jobAnalysis.create({
      data: {
        profileId: testProfileId,
        jobId: analyzedOnlyJobId,
        strengths: [],
        weaknesses: [],
        missingSkills: [],
        verdict: "CAUTION",
        justification: "n/a",
      },
    });

    await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: draftedJobId,
        name: "Draft CV",
        status: "DRAFT",
        snapshotData: {},
      },
    });

    const appliedCv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: appliedJobId,
        name: "Applied CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: {},
      },
    });
    await prisma.application.create({
      data: {
        cvId: appliedCv.id,
        profileId: testProfileId,
        jobListingId: appliedJobId,
        stage: "SCREENING",
      },
    });
  });

  afterAll(async () => {
    await safeCleanup("application-tracker-list: delete testUser", async () => {
      await prisma.user.delete({ where: { id: testUserId } });
    });
    await safeCleanup(
      "application-tracker-list: delete jobListings",
      async () => {
        await prisma.jobListing.deleteMany({
          where: {
            id: {
              in: [
                favoriteOnlyJobId,
                analyzedOnlyJobId,
                draftedJobId,
                appliedJobId,
              ],
            },
          },
        });
      },
    );
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

  it("returns row-accurate data for each of the 4 status permutations and issues exactly one query", async () => {
    const querySpy = jest.spyOn(prisma, "$queryRaw");

    const res = await getListHandler();
    expect(res.status).toBe(200);
    const { rows } = (await res.json()) as {
      rows: Array<{
        jobId: string;
        favorite: boolean;
        deepAnalysisDone: boolean;
        cvStatus: string;
        applicationStage: string | null;
      }>;
    };

    // Exactly one query issued regardless of job count (AC.9's second scenario).
    expect(querySpy).toHaveBeenCalledTimes(1);

    const byId = Object.fromEntries(rows.map((r) => [r.jobId, r]));

    expect(byId[favoriteOnlyJobId]).toMatchObject({
      favorite: true,
      deepAnalysisDone: false,
      cvStatus: "not_started",
      applicationStage: null,
    });
    expect(byId[analyzedOnlyJobId]).toMatchObject({
      favorite: false,
      deepAnalysisDone: true,
      cvStatus: "not_started",
      applicationStage: null,
    });
    expect(byId[draftedJobId]).toMatchObject({
      favorite: false,
      deepAnalysisDone: false,
      cvStatus: "draft",
      applicationStage: null,
    });
    expect(byId[appliedJobId]).toMatchObject({
      favorite: false,
      deepAnalysisDone: false,
      cvStatus: "applied",
      applicationStage: "SCREENING",
    });

    querySpy.mockRestore();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getListHandler();
    expect(res.status).toBe(401);
  });
});
