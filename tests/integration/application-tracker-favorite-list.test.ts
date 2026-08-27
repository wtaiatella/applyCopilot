/**
 * @jest-environment node
 */
import "dotenv/config";
import { PUT as putFavoriteHandler } from "@/app/api/jobs/[id]/favorite/route";
import { GET as getListHandler } from "@/app/api/application-tracker/list/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

// MODIFIED PER TICKET INSTRUCTION (T051): the task originally specified a Cypress E2E spec
// (applyCopilot/cypress/e2e/application-tracker-favorite-list.cy.ts), but this repo has no
// Cypress installed/configured anywhere. Per the ticket's explicit deviation instruction, this
// is written as a Jest integration test exercising the actual "star, reload, check the List
// view" round trip through the real route handlers — same pattern as
// application-tracker-happy-path.test.ts (T050).

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("Favorite a job → reload → List view reflects it (009 US6/US7, SC-3, SC-4, AC.8, AC.9)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-tracker-fav-list-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Fave", lastName: "List" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-fav-list-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
        classificationStatus: "COMPLETED",
      },
    });
    jobListingId = jobListing.id;

    // Deep Analysis already done for this job (so the List row exercises a non-default column).
    await prisma.jobAnalysis.create({
      data: {
        profileId: testProfileId,
        jobId: jobListingId,
        strengths: [],
        weaknesses: [],
        missingSkills: [],
        verdict: "CAUTION",
        justification: "n/a",
      },
    });
  });

  afterAll(async () => {
    await safeCleanup(
      "application-tracker-favorite-list: delete testUser",
      async () => {
        await prisma.user.delete({ where: { id: testUserId } });
      },
    );
    await safeCleanup(
      "application-tracker-favorite-list: delete jobListing",
      async () => {
        await prisma.jobListing.delete({ where: { id: jobListingId } });
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

  it("star persists across a reload and is reflected in the List view alongside accurate Deep Analysis/CV/Application status", async () => {
    // 1. Star the job in Jobs Matching.
    const putRes = await putFavoriteHandler(
      new Request(`http://localhost:3000/api/jobs/${jobListingId}/favorite`, {
        method: "PUT",
        body: JSON.stringify({ favorite: true }),
      }),
      { params: Promise.resolve({ id: jobListingId }) },
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({
      jobListingId,
      favorite: true,
    });

    // 2. "Reload" — a fresh GET of the consolidated List view (simulates the client refetch on
    // page load, no client-side cache in play here).
    const listRes1 = await getListHandler();
    expect(listRes1.status).toBe(200);
    const { rows: rows1 } = (await listRes1.json()) as {
      rows: Array<{
        jobId: string;
        favorite: boolean;
        deepAnalysisDone: boolean;
        cvStatus: string;
        applicationStage: string | null;
      }>;
    };
    const row1 = rows1.find((r) => r.jobId === jobListingId);
    expect(row1).toMatchObject({
      favorite: true,
      deepAnalysisDone: true,
      cvStatus: "not_started",
      applicationStage: null,
    });

    // 3. Reload again — confirm the star still persists (not a one-request fluke).
    const listRes2 = await getListHandler();
    expect(listRes2.status).toBe(200);
    const { rows: rows2 } = (await listRes2.json()) as {
      rows: Array<{ jobId: string; favorite: boolean }>;
    };
    const row2 = rows2.find((r) => r.jobId === jobListingId);
    expect(row2?.favorite).toBe(true);

    const favRow = await prisma.jobFavorite.findUnique({
      where: {
        profileId_jobListingId: {
          profileId: testProfileId,
          jobListingId,
        },
      },
    });
    expect(favRow).not.toBeNull();
  });
});
