/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as reviewAllHandler } from "@/app/api/cv/[cvId]/ai/review-all/route";
import { POST as generateBulletHandler } from "@/app/api/cv/[cvId]/ai/generate-bullet/route";
import { POST as reviewBulletHandler } from "@/app/api/cv/[cvId]/ai/review-bullet/route";
import { POST as generateSummaryHandler } from "@/app/api/cv/[cvId]/ai/generate-summary/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";
import type { CVSnapshotData } from "@/types/cv";

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
    summaries: [
      {
        id: "sum1",
        sourceSummaryId: null,
        title: "Default",
        content: "Experienced backend engineer.",
        isAIGenerated: false,
        included: true,
      },
    ],
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
        freeFormContext: ["Led a team of 5 engineers"],
        bullets: [
          {
            id: "bullet1",
            sourceBulletId: "src-bullet1",
            text: "Did some backend work",
            type: "BULLET",
            included: true,
            sortOrder: 0,
          },
          {
            id: "bullet2",
            sourceBulletId: null,
            text: "Built REST APIs",
            type: "BULLET",
            included: true,
            sortOrder: 1,
          },
        ],
      },
    ],
    education: [],
    projects: [],
    skills: [],
  };
}

describe("CV Composer job-aware AI routes (Phase 5, US3)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as jest.Mock;
  const testEmail = `cv-ai-test-${Date.now()}@example.com`;
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

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-cv-ai-${Date.now()}`,
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
        name: "Test CV",
        status: "DRAFT",
        snapshotData: makeSnapshot() as unknown as object,
      },
    });
    cvId = cv.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
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

  describe("POST /api/cv/[cvId]/ai/review-all", () => {
    it("returns suggestions + relevanceDecisions, using the job description and no Deep Analysis (reduced context)", async () => {
      mockGenerateJSON.mockResolvedValue({
        suggestions: [
          {
            type: "REWRITE",
            bulletId: "bullet1",
            originalText: "Did some backend work",
            revisedText: "Owned backend services end to end",
          },
        ],
        relevanceDecisions: [
          { bulletId: "bullet1", include: true },
          { bulletId: "bullet2", include: true },
        ],
      });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
        },
      );
      const res = await reviewAllHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.suggestions).toHaveLength(1);
      expect(data.relevanceDecisions).toHaveLength(2);

      // Job description (no Deep Analysis yet) was passed to the AI prompt.
      const userPrompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(userPrompt).toContain("Own our payments platform end to end.");
      expect(userPrompt).toContain("Not available (no Deep Analysis yet)");
    });

    it("includes cached Deep Analysis weaknesses/missingSkills when present", async () => {
      const analysis = await prisma.jobAnalysis.create({
        data: {
          jobId: jobListingId,
          strengths: ["Strong Node.js background"],
          weaknesses: ["No prior fintech experience"],
          missingSkills: ["Kafka"],
          verdict: "CAUTION",
          justification: "Good technical fit, some domain gaps.",
        },
      });

      mockGenerateJSON.mockResolvedValue({
        suggestions: [],
        relevanceDecisions: [],
      });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
        },
      );
      await reviewAllHandler(req, { params: Promise.resolve({ cvId }) });

      const userPrompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(userPrompt).toContain("No prior fintech experience");
      expect(userPrompt).toContain("Kafka");

      await prisma.jobAnalysis.delete({ where: { id: analysis.id } });
    });

    // ── Security Requirements: drop any suggestion/decision referencing an id not present
    // in this CV's own snapshot before returning to the client (defense-in-depth). ──
    it("drops REWRITE/MERGE suggestions and relevanceDecisions referencing an id not in this CV's snapshot", async () => {
      mockGenerateJSON.mockResolvedValue({
        suggestions: [
          {
            type: "REWRITE",
            bulletId: "bullet1",
            originalText: "Did some backend work",
            revisedText: "Owned backend services end to end",
          },
          {
            type: "REWRITE",
            bulletId: "hallucinated-bullet-id",
            originalText: "not real",
            revisedText: "not real either",
          },
          {
            type: "MERGE",
            bulletIds: ["bullet1", "hallucinated-bullet-id"],
            originalTexts: ["a", "b"],
            combinedText: "combined",
          },
          { type: "NEW", text: "A brand new bullet" },
        ],
        relevanceDecisions: [
          { bulletId: "bullet1", include: true },
          { bulletId: "bullet2", include: false },
          { bulletId: "hallucinated-bullet-id", include: true },
        ],
      });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
        },
      );
      const res = await reviewAllHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      // The hallucinated REWRITE and MERGE are dropped; the valid REWRITE and NEW survive.
      expect(data.suggestions).toHaveLength(2);
      expect(
        data.suggestions.every(
          (s: { type: string; bulletId?: string; bulletIds?: string[] }) => {
            if (s.type === "REWRITE") return s.bulletId === "bullet1";
            if (s.type === "MERGE") return false; // should have been dropped entirely
            return true; // NEW
          },
        ),
      ).toBe(true);

      // The hallucinated relevanceDecision is dropped; the two real ones survive.
      expect(data.relevanceDecisions).toHaveLength(2);
      expect(
        data.relevanceDecisions
          .map((d: { bulletId: string }) => d.bulletId)
          .sort(),
      ).toEqual(["bullet1", "bullet2"]);
    });

    it("returns 404 when entityId is not present in this CV's own snapshot", async () => {
      mockGenerateJSON.mockResolvedValue({ suggestions: [] });
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: "experience",
            entityId: "not-in-snapshot",
          }),
        },
      );
      const res = await reviewAllHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(404);
      expect(mockGenerateJSON).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated requests", async () => {
      mockAuth.mockResolvedValue(null);
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
        },
      );
      const res = await reviewAllHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 for a CV not owned by the caller", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "some-other-user-id",
          email: "other@example.com",
          role: "USER",
        },
        expires: "any",
      });
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-all`,
        {
          method: "POST",
          body: JSON.stringify({ entityType: "experience", entityId: "exp1" }),
        },
      );
      const res = await reviewAllHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cv/[cvId]/ai/generate-bullet", () => {
    it("generates a bullet using context notes + job description", async () => {
      mockGenerateJSON.mockResolvedValue({ revisedText: "A brand new bullet" });

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
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.revisedText).toBe("A brand new bullet");
    });

    it("returns 404 when entityId is not present in this CV's own snapshot", async () => {
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/generate-bullet`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: "experience",
            entityId: "not-in-snapshot",
          }),
        },
      );
      const res = await generateBulletHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cv/[cvId]/ai/review-bullet", () => {
    it("reviews a single bullet using job context", async () => {
      mockGenerateJSON.mockResolvedValue({ revisedText: "Improved bullet" });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-bullet`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: "experience",
            entityId: "exp1",
            bulletId: "bullet1",
          }),
        },
      );
      const res = await reviewBulletHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.revisedText).toBe("Improved bullet");
    });

    it("returns 404 when bulletId is not present in the target entity", async () => {
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/review-bullet`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: "experience",
            entityId: "exp1",
            bulletId: "not-a-real-bullet",
          }),
        },
      );
      const res = await reviewBulletHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cv/[cvId]/ai/generate-summary", () => {
    it("generates a job-aware summary from this CV's own snapshot experiences", async () => {
      mockGenerateJSON.mockResolvedValue({
        content: "Backend engineer tailored to this job.",
      });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/generate-summary`,
        { method: "POST" },
      );
      const res = await generateSummaryHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.content).toBe("Backend engineer tailored to this job.");

      const userPrompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(userPrompt).toContain("Acme");
      expect(userPrompt).toContain("Did some backend work");
    });

    it("rejects unauthenticated requests", async () => {
      mockAuth.mockResolvedValue(null);
      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/ai/generate-summary`,
        { method: "POST" },
      );
      const res = await generateSummaryHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(401);
    });
  });
});
