/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as syncProfileHandler } from "@/app/api/profile/sync/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

// Mock the auth middleware
jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Mock the AI client to clean the profile text
jest.mock("@/lib/ai/aiClient", () => ({
  generateText: jest.fn().mockResolvedValue(
    "Cleaned Profile: Software Engineer, 5 years Experience, Skills: React, Node.js"
  ),
}));

// Mock the vector service to avoid loading the real TensorFlow model in integration tests
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(512).fill(0.123)),
}));

describe("UserProfile AI Synchronization Endpoint Integration Tests", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `sync-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    // Create test user and profile in database
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Jane",
            lastName: "Doe",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;

    // Seed test experience and skills so we have content to clean
    await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Vercel",
        position: "Frontend Dev",
        startDate: new Date("2022-01-01"),
        current: true,
      },
    });

    await prisma.skill.create({
      data: {
        profileId: testProfileId,
        name: "React",
        proficiency: "ADVANCED",
      },
    });
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
  });

  it("should clean the profile via LLM, generate vector, and update UserProfile", async () => {
    const req = new Request("http://localhost:3000/api/profile/sync", {
      method: "POST",
    });

    const res = await syncProfileHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cleanedText).toContain("Cleaned Profile");

    // Fetch the profile directly from database to verify values
    const updatedProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });

    expect(updatedProfile?.aiCleanedText).toContain("Cleaned Profile");
    expect(updatedProfile?.embeddingSyncedAt).not.toBeNull();

    // Verify embedding vector exists in DB by querying directly (since Prisma unsupported fails to return it via findUnique)
    const rawResult = await prisma.$queryRaw<any[]>`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;
    const dbVectorStr = rawResult[0]?.embedding;
    expect(dbVectorStr).toBeDefined();
    
    // Check that it is a 512-dimension vector array format e.g. "[0.123,0.123,...]"
    const parsedVector = JSON.parse(dbVectorStr);
    expect(parsedVector).toBeInstanceOf(Array);
    expect(parsedVector.length).toBe(512);
    expect(parsedVector[0]).toBeCloseTo(0.123);
  });

  it("should reject unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/profile/sync", {
      method: "POST",
    });
    const res = await syncProfileHandler(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 if user has no experiences, education or skills", async () => {
    // Create another user without profile content
    const emptyUser = await prisma.user.create({
      data: {
        email: `empty-${Date.now()}@example.com`,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Empty",
            lastName: "Profile",
          },
        },
      },
    });

    mockAuth.mockResolvedValue({
      user: { id: emptyUser.id, email: emptyUser.email, role: "USER" },
      expires: "any",
    });

    const req = new Request("http://localhost:3000/api/profile/sync", {
      method: "POST",
    });

    const res = await syncProfileHandler(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Please fill in at least one skill or experience before syncing");

    // Cleanup
    await prisma.user.delete({ where: { id: emptyUser.id } }).catch(() => {});
  });
});
