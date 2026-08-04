/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as generateBulletHandler } from "@/app/api/cv/[cvId]/ai/generate-bullet/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";
import type { CVSnapshotData } from "@/types/cv";

// MODIFIED PER USER DECISION: T050 originally specified a Cypress E2E test, but this repo has
// no Cypress installed/configured. This Jest integration test provides equivalent functional
// coverage for the reduced-context path (AC.6, FR-10), following the existing
// tests/integration/ convention (see e.g. cv-ai.test.ts).

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

function makeSnapshot(): CVSnapshotData {
  return {
    version: 1,
    basicData: {
      firstName: "Jane",
      lastName: "Doe",
      phone: null,
      location: null,
      linkedin: null,
      github: null,
      website: null,
      title: null,
    },
    summaries: [],
    experiences: [
      {
        id: "exp1",
        sourceExperienceId: "src-exp1",
        company: "Acme",
        position: "Backend Engineer",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: null,
        // No free-form context notes — reduced-context mode relies solely on the job
        // description (no Deep Analysis has ever been run for this job).
        freeFormContext: [],
        bullets: [
          {
            id: "bullet1",
            sourceBulletId: "src-bullet1",
            text: "Did some backend work",
            type: "BULLET",
            included: true,
            sortOrder: 0,
          },
        ],
      },
    ],
    education: [],
    projects: [],
    skills: [],
  };
}

describe("CV Composer job-aware AI — reduced-context mode (AC.6, FR-10)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as jest.Mock;
  const testEmail = `cv-reduced-context-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;
  let cvId: string;

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

    // Job with a description but — deliberately — NO JobAnalysis row (no Deep Analysis has
    // ever been run for it).
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-reduced-context-${Date.now()}`,
        title: "Senior Backend Engineer",
        company: "Acme Corp",
        url: "https://example.com/job",
        fullDescription: "Own our payments platform end to end.",
      },
    });
    jobListingId = jobListing.id;

    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId,
        name: "Reduced Context Test CV",
        status: "DRAFT",
        snapshotData: makeSnapshot() as unknown as object,
      },
    });
    cvId = cv.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.jobListing
      .delete({ where: { id: jobListingId } })
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

  it("succeeds using only the job description as context — no Deep Analysis, no free-form notes", async () => {
    // Confirm precondition: no cached Deep Analysis exists for this job.
    const analysis = await prisma.jobAnalysis.findFirst({
      where: { jobId: jobListingId },
    });
    expect(analysis).toBeNull();

    mockGenerateJSON.mockResolvedValue({
      revisedText: "Owned backend services end to end for a payments platform",
    });

    const req = new Request(
      `http://localhost:3000/api/cv/${cvId}/ai/generate-bullet`,
      {
        method: "POST",
        body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
      },
    );
    const res = await generateBulletHandler(req, {
      params: Promise.resolve({ cvId }),
    });

    // Not blocked/erroring — succeeds despite no context notes and no Deep Analysis.
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revisedText).toBe(
      "Owned backend services end to end for a payments platform",
    );

    // The job description (and only the job description) was passed as job context.
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    const userPrompt = mockGenerateJSON.mock.calls[0][0] as string;
    expect(userPrompt).toContain("Own our payments platform end to end.");
  });
});
