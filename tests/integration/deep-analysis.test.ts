/**
 * @jest-environment node
 */
import "dotenv/config";
import {
  GET as checkAnalysisHandler,
  POST as analyzeJobHandler,
} from "@/app/api/jobs/[id]/analyze/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";

// Mock auth middleware
jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Mock AI client generateJSON method
jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

describe("JobListing On-Demand Deep Analysis Endpoint Integration Tests", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as jest.Mock;
  const testEmail = `analysis-test-${Date.now()}@example.com`;
  const testEmailUserB = `analysis-test-userb-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let testJobId: string;
  let userBId: string;

  beforeAll(async () => {
    // 1. Create a test User and UserProfile
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "John",
            lastName: "Developer",
            title: "Senior Node.js Engineer",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;

    // Seed a skill on the profile
    await prisma.skill.create({
      data: {
        profileId: testProfileId,
        name: "Node.js",
        proficiency: "ADVANCED",
      },
    });

    // 2. Create a test JobListing
    const job = await prisma.jobListing.create({
      data: {
        portalId: "example",
        externalJobId: `ext-${Date.now()}`,
        title: "Senior Backend Developer",
        company: "Awesome Systems",
        url: "https://example.com/jobs/node-dev",
        isFullDescriptionFetched: true,
        fullDescription:
          "We need a Node.js developer with strong database experience.",
      },
    });

    testJobId = job.id;

    // 3. Create a second test User (User B) with their own UserProfile
    const userB = await prisma.user.create({
      data: {
        email: testEmailUserB,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Jane",
            lastName: "Candidate",
            title: "Junior Frontend Engineer",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    userBId = userB.id;
  });

  afterAll(async () => {
    // Clean up database records
    await prisma.jobAnalysis
      .deleteMany({ where: { jobId: testJobId } })
      .catch(() => {});
    await prisma.jobListing
      .deleteMany({ where: { id: testJobId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userBId } }).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should generate analysis via LLM call and cache it to the database on the first request", async () => {
    // Mock user auth session
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
    });

    // Mock LLM JSON output response
    const mockAnalysisOutput = {
      strengths: ["Strong matching Node.js background"],
      weaknesses: ["Missing AWS Cloud experience"],
      missingSkills: ["AWS", "Docker"],
      verdict: "APPLY",
      justification: "Candidate has the core Node.js skills required.",
    };
    mockGenerateJSON.mockResolvedValue(mockAnalysisOutput);

    // Call the handler directly (simulate Next.js App Router route execution)
    const request = new Request(
      `http://localhost:3000/api/jobs/${testJobId}/analyze`,
      {
        method: "POST",
      },
    );

    const response = await analyzeJobHandler(request, {
      params: Promise.resolve({ id: testJobId }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.verdict).toBe("APPLY");
    expect(data.strengths).toContain("Strong matching Node.js background");
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);

    // Check that it was persisted in the database cache
    const dbRecord = await prisma.jobAnalysis.findUnique({
      where: {
        profileId_jobId: { profileId: testProfileId, jobId: testJobId },
      },
    });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.verdict).toBe("APPLY");
  });

  it("should load analysis from database cache and not call the LLM on subsequent requests", async () => {
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
    });

    const request = new Request(
      `http://localhost:3000/api/jobs/${testJobId}/analyze`,
      {
        method: "POST",
      },
    );

    const response = await analyzeJobHandler(request, {
      params: Promise.resolve({ id: testJobId }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.verdict).toBe("APPLY");

    // Ensure generateJSON was NOT called on this request because it hit the cache
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it("should return cached: true and analysis data on GET when cached", async () => {
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
    });

    const request = new Request(
      `http://localhost:3000/api/jobs/${testJobId}/analyze`,
      {
        method: "GET",
      },
    );

    const response = await checkAnalysisHandler(request, {
      params: Promise.resolve({ id: testJobId }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.cached).toBe(true);
    expect(data.analysis.verdict).toBe("APPLY");
  });

  it("should not leak User A's cached analysis to User B for the same job (cross-tenant isolation)", async () => {
    // At this point User A already has a cached analysis for testJobId
    // (created by earlier tests). Now simulate User B requesting the same job.
    mockAuth.mockResolvedValue({
      user: { id: userBId, email: testEmailUserB, role: "USER" },
    });

    // User B's GET should not see User A's cached analysis
    const getRequest = new Request(
      `http://localhost:3000/api/jobs/${testJobId}/analyze`,
      {
        method: "GET",
      },
    );

    const getResponse = await checkAnalysisHandler(getRequest, {
      params: Promise.resolve({ id: testJobId }),
    });
    expect(getResponse.status).toBe(200);

    const getData = await getResponse.json();
    expect(getData.cached).toBe(false);
    expect(getData.analysis).toBeUndefined();

    // User B's POST should trigger a fresh LLM call, not reuse User A's cache
    const mockAnalysisOutputUserB = {
      strengths: ["Solid frontend fundamentals"],
      weaknesses: ["Missing backend experience"],
      missingSkills: ["Node.js"],
      verdict: "CAUTION",
      justification: "Candidate has some but not all required skills.",
    };
    mockGenerateJSON.mockResolvedValue(mockAnalysisOutputUserB);

    const postRequest = new Request(
      `http://localhost:3000/api/jobs/${testJobId}/analyze`,
      {
        method: "POST",
      },
    );

    const postResponse = await analyzeJobHandler(postRequest, {
      params: Promise.resolve({ id: testJobId }),
    });
    expect(postResponse.status).toBe(200);

    const postData = await postResponse.json();
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(postData.verdict).toBe("CAUTION");
    expect(postData.verdict).not.toBe("APPLY");
    expect(postData.strengths).toContain("Solid frontend fundamentals");
    expect(postData.strengths).not.toContain(
      "Strong matching Node.js background",
    );
  });
});
