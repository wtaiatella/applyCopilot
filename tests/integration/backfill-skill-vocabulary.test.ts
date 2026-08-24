/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as postBackfillHandler } from "@/app/api/admin/backfill-skill-vocabulary/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("Backfill Skill Vocabulary Integration Tests (POST /api/admin/backfill-skill-vocabulary)", () => {
  const mockAuth = auth as unknown as jest.Mock;

  const adminSession = {
    user: {
      id: "admin-user-id",
      email: "wtaiatella@gmail.com",
      role: "ADMIN",
    },
    expires: "any",
  };

  const createdUserIds: string[] = [];
  const createdJobIds: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.jobListing.deleteMany({
      where: { id: { in: createdJobIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await pool.end();
  });

  it("should return 401 if unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await postBackfillHandler();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 if user is not ADMIN", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "test-user-id", email: "user@example.com", role: "USER" },
      expires: "any",
    });

    const res = await postBackfillHandler();
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("resets eligible JobListing.classificationStatus to PENDING and clears eligible UserProfile.embeddingSyncedAt, without creating new jobs/workers", async () => {
    mockAuth.mockResolvedValue(adminSession);

    // Eligible UserProfile: embeddingSyncedAt is set.
    const eligibleUser = await prisma.user.create({
      data: {
        email: `backfill-eligible-${Date.now()}@example.com`,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Eligible",
            embeddingSyncedAt: new Date(),
          },
        },
      },
      include: { profile: true },
    });
    createdUserIds.push(eligibleUser.id);

    // Ineligible UserProfile: embeddingSyncedAt already null.
    const ineligibleUser = await prisma.user.create({
      data: {
        email: `backfill-ineligible-${Date.now()}@example.com`,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Ineligible",
            embeddingSyncedAt: null,
          },
        },
      },
      include: { profile: true },
    });
    createdUserIds.push(ineligibleUser.id);

    // Eligible JobListing: classificationStatus COMPLETED with attempts/error set.
    const eligibleJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-eligible-${Date.now()}-${Math.random()}`,
        title: "Eligible Job",
        company: "Test Co",
        url: "https://example.com/eligible-job",
        classificationStatus: "COMPLETED",
        classificationAttempts: 2,
        classificationError: "previous failure",
      },
    });
    createdJobIds.push(eligibleJob.id);

    // Ineligible JobListing: not yet classified (PENDING), should be left untouched.
    const ineligibleJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-ineligible-${Date.now()}-${Math.random()}`,
        title: "Ineligible Job",
        company: "Test Co",
        url: "https://example.com/ineligible-job",
        classificationStatus: "PENDING",
      },
    });
    createdJobIds.push(ineligibleJob.id);

    const jobCountBefore = await prisma.jobListing.count();

    const res = await postBackfillHandler();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.profilesReset).toBeGreaterThanOrEqual(1);
    expect(data.jobsRequeued).toBeGreaterThanOrEqual(1);

    const eligibleProfileAfter = await prisma.userProfile.findUnique({
      where: { userId: eligibleUser.id },
    });
    expect(eligibleProfileAfter?.embeddingSyncedAt).toBeNull();

    const ineligibleProfileAfter = await prisma.userProfile.findUnique({
      where: { userId: ineligibleUser.id },
    });
    expect(ineligibleProfileAfter?.embeddingSyncedAt).toBeNull();

    const eligibleJobAfter = await prisma.jobListing.findUnique({
      where: { id: eligibleJob.id },
    });
    expect(eligibleJobAfter?.classificationStatus).toBe("PENDING");
    expect(eligibleJobAfter?.classificationAttempts).toBe(0);
    expect(eligibleJobAfter?.classificationError).toBeNull();

    const ineligibleJobAfter = await prisma.jobListing.findUnique({
      where: { id: ineligibleJob.id },
    });
    expect(ineligibleJobAfter?.classificationStatus).toBe("PENDING");

    // No new job/worker rows are created by the backfill — only existing rows are updated.
    const jobCountAfter = await prisma.jobListing.count();
    expect(jobCountAfter).toBe(jobCountBefore);
  });
});
