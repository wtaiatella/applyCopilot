/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as generateSummaryHandler } from "@/app/api/profile/summaries/generate/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

describe("AI Summary Generation Integration Tests (POST /api/profile/summaries/generate)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as jest.Mock;
  const testEmail = `ai-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Create test user and profile in database
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Jane",
            lastName: "Smith",
            title: "Software Developer",
            experiences: {
              create: {
                company: "Tech Corp",
                position: "Frontend Dev",
                startDate: new Date("2023-01-01"),
                current: true,
                bullets: {
                  create: {
                    text: "Built modern Next.js UIs",
                    sortOrder: 0,
                  },
                },
              },
            },
            projects: {
              create: {
                name: "Personal Portfolio",
                technologies: ["React", "CSS"],
                bullets: {
                  create: {
                    text: "Designed with responsive layouts",
                    sortOrder: 0,
                  },
                },
              },
            },
            education: {
              create: {
                institution: "State University",
                degree: "B.S.",
                fieldOfStudy: "Computer Science",
                startDate: new Date("2019-09-01"),
                endDate: new Date("2023-05-01"),
              },
            },
            skills: {
              create: {
                name: "JavaScript",
                proficiency: "EXPERT",
                yearsExperience: 4,
              },
            },
          },
        },
      },
      include: {
        profile: true,
      },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    // Clean up database records
    if (testUserId) {
      await prisma.user.delete({
        where: { id: testUserId },
      }).catch(() => {});
    }

    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default authenticated mock session
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });

    // Spy on Winston logger methods
    infoSpy = jest.spyOn(logger, "info").mockImplementation(() => logger);
    warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    errorSpy = jest.spyOn(logger, "error").mockImplementation(() => logger);
  });

  afterEach(async () => {
    // Clean AIUsageLogs for this user
    await prisma.aIUsageLog.deleteMany({
      where: { userId: testUserId },
    });
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should return 401 if unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
      method: "POST",
      body: JSON.stringify({ tone: "professional", instructions: "Make it short" }),
    });

    const res = await generateSummaryHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 if request body is invalid JSON", async () => {
    const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
      method: "POST",
      body: "not-json",
    });

    const res = await generateSummaryHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("should return 400 if tone is missing", async () => {
    const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
      method: "POST",
      body: JSON.stringify({ instructions: "Make it short" }),
    });

    const res = await generateSummaryHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Tone is required");
  });

  it("should return 404 if user profile does not exist", async () => {
    // Setup another authenticated user with NO profile
    const nonProfileEmail = `non-profile-${Date.now()}@example.com`;
    const userNoProfile = await prisma.user.create({
      data: {
        email: nonProfileEmail,
        password: "hashedpassword123",
      },
    });

    mockAuth.mockResolvedValue({
      user: { id: userNoProfile.id, email: nonProfileEmail, role: "USER" },
      expires: "any",
    });

    try {
      const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
        method: "POST",
        body: JSON.stringify({ tone: "professional" }),
      });

      const res = await generateSummaryHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Profile not found");
    } finally {
      await prisma.user.delete({
        where: { id: userNoProfile.id },
      }).catch(() => {});
    }
  });

  it("should generate AI summary successfully and record usage", async () => {
    const mockOutput = {
      title: "Senior Full Stack Dev Mocked",
      content: "Jane is an expert developer with experience in React and Next.js.",
    };
    mockGenerateJSON.mockResolvedValue(mockOutput);

    const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
      method: "POST",
      body: JSON.stringify({ tone: "professional", instructions: "Include state management" }),
    });

    const res = await generateSummaryHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe(mockOutput.title);
    expect(data.content).toBe(mockOutput.content);

    // Verify LLM generateJSON was called with the context prompt
    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    const [promptArg, capabilityArg] = mockGenerateJSON.mock.calls[0];
    expect(capabilityArg).toBe("summaries");
    expect(promptArg).toContain("Jane");
    expect(promptArg).toContain("Tech Corp");
    expect(promptArg).toContain("Personal Portfolio");
    expect(promptArg).toContain("State University");
    expect(promptArg).toContain("JavaScript");

    // Verify AI usage log created in DB
    const logs = await prisma.aIUsageLog.findMany({
      where: { userId: testUserId, action: "summary" },
    });
    expect(logs).toHaveLength(1);

    // Verify Winston audit logs
    expect(infoSpy).toHaveBeenCalledWith("AI Summary generated successfully", {
      userId: testUserId,
      tone: "professional",
    });
  });

  it("should return 429 when rate limit of 10 requests/hour is exceeded", async () => {
    // 1. Pre-insert 10 AIUsageLog entries in the DB for this user in the last hour
    const now = new Date();
    await prisma.aIUsageLog.createMany({
      data: Array.from({ length: 10 }).map(() => ({
        userId: testUserId,
        action: "summary",
        createdAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 mins ago
      })),
    });

    // 2. Insert 1 entry for another user to verify isolation
    const otherUser = await prisma.user.create({
      data: {
        email: `other-user-limit-${Date.now()}@example.com`,
        password: "hashedpassword123",
      },
    });
    await prisma.aIUsageLog.create({
      data: {
        userId: otherUser.id,
        action: "summary",
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      },
    });

    // 3. Insert 1 entry that is older than 1 hour to verify windowing
    await prisma.aIUsageLog.create({
      data: {
        userId: testUserId,
        action: "summary",
        createdAt: new Date(now.getTime() - 75 * 60 * 1000), // 1h15m ago
      },
    });

    try {
      // 4. Try making the 11th request (which should be blocked by rate limit)
      const req = new Request("http://localhost:3000/api/profile/summaries/generate", {
        method: "POST",
        body: JSON.stringify({ tone: "professional" }),
      });

      const res = await generateSummaryHandler(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toBe("Rate limit reached. You can only generate 10 summaries per hour.");

      // Verify Winston logger warned
      expect(warnSpy).toHaveBeenCalledWith(
        `User ${testUserId} hit summary AI generation rate limit`,
        { summaryCount: 10 }
      );

      // Verify no additional call to LLM happened
      expect(mockGenerateJSON).not.toHaveBeenCalled();
    } finally {
      await prisma.user.delete({
        where: { id: otherUser.id },
      }).catch(() => {});
    }
  });
});
