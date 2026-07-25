/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as checkAnalysisHandler, POST as analyzeJobHandler } from "@/app/api/jobs/[id]/analyze/route";
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
  let testUserId: string;
  let testProfileId: string;
  let testJobId: string;

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
        fullDescription: "We need a Node.js developer with strong database experience.",
      },
    });

    testJobId = job.id;
  });

  afterAll(async () => {
    // Clean up database records
    await prisma.jobAnalysis.deleteMany({ where: { jobId: testJobId } }).catch(() => {});
    await prisma.jobListing.deleteMany({ where: { id: testJobId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
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
    const request = new Request(`http://localhost:3000/api/jobs/${testJobId}/analyze`, {
      method: "POST",
    });

    const response = await analyzeJobHandler(request, { params: Promise.resolve({ id: testJobId }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.verdict).toBe("APPLY");
    expect(data.strengths).toContain("Strong matching Node.js background");
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);

    // Check that it was persisted in the database cache
    const dbRecord = await prisma.jobAnalysis.findUnique({
      where: { jobId: testJobId },
    });
    expect(dbRecord).toBeDefined();
    expect(dbRecord?.verdict).toBe("APPLY");
  });

  it("should load analysis from database cache and not call the LLM on subsequent requests", async () => {
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
    });

    const request = new Request(`http://localhost:3000/api/jobs/${testJobId}/analyze`, {
      method: "POST",
    });

    const response = await analyzeJobHandler(request, { params: Promise.resolve({ id: testJobId }) });
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

    const request = new Request(`http://localhost:3000/api/jobs/${testJobId}/analyze`, {
      method: "GET",
    });

    const response = await checkAnalysisHandler(request, { params: Promise.resolve({ id: testJobId }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.cached).toBe(true);
    expect(data.analysis.verdict).toBe("APPLY");
  });
});
