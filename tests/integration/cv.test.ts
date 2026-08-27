/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as createCVHandler } from "@/app/api/cv/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import {
  safeCleanup,
  deleteProfileExperienceBullets,
} from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("POST /api/cv — idempotent create-or-get", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-composer-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;

  beforeAll(async () => {
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
      include: { profile: true },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingId = jobListing.id;

    // Give the profile at least one entity type so the snapshot clone has content.
    await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Acme",
        position: "Engineer",
        startDate: new Date("2020-01-01"),
        current: true,
        bullets: {
          create: [{ text: "Shipped features", type: "BULLET", sortOrder: 0 }],
        },
      },
    });
  });

  afterAll(async () => {
    // T017 rework: ExperienceBullet.experienceId is SetNull (not Cascade), so it must be
    // hard-deleted here, while still attached, before the user cascade orphans it instead.
    await safeCleanup("cv.test afterAll bullets", async () =>
      deleteProfileExperienceBullets(testProfileId),
    );
    await safeCleanup("cv.test afterAll user", async () =>
      prisma.user.delete({ where: { id: testUserId } }),
    );
    await safeCleanup("cv.test afterAll jobListing", async () =>
      prisma.jobListing.delete({ where: { id: jobListingId } }),
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

  it("creates a new CV on the first call", async () => {
    const req = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId }),
    });

    const res = await createCVHandler(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.jobListingId).toBe(jobListingId);
    expect(data.status).toBe("DRAFT");
    expect(data.appliedAt).toBeNull();
  });

  it("returns the same cvId on a second call for the same job (no duplicate row, zero Profile writes)", async () => {
    const experienceCountBefore = await prisma.experience.count({
      where: { profileId: testProfileId },
    });

    const req1 = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId }),
    });
    const res1 = await createCVHandler(req1);
    const data1 = await res1.json();

    const req2 = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId }),
    });
    const res2 = await createCVHandler(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(data2.id).toBe(data1.id);

    const cvRows = await prisma.cV.findMany({
      where: { profileId: testProfileId, jobListingId },
    });
    expect(cvRows).toHaveLength(1);

    const experienceCountAfter = await prisma.experience.count({
      where: { profileId: testProfileId },
    });
    expect(experienceCountAfter).toBe(experienceCountBefore);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId }),
    });
    const res = await createCVHandler(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a non-existent job listing", async () => {
    const req = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId: "nonexistent_job_id" }),
    });
    const res = await createCVHandler(req);
    expect(res.status).toBe(404);
  });
});
