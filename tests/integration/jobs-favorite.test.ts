/**
 * @jest-environment node
 */
import "dotenv/config";
import { PUT as putFavoriteHandler } from "@/app/api/jobs/[id]/favorite/route";
import { GET as getJobsHandler } from "@/app/api/jobs/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("PUT /api/jobs/[id]/favorite — idempotent per-profile set (009 US7, AC.8)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmailA = `jobs-favorite-a-${Date.now()}@example.com`;
  const testEmailB = `jobs-favorite-b-${Date.now()}@example.com`;
  let userAId: string;
  let userBId: string;
  let jobListingId: string;

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: {
          email: testEmailA,
          password: "hashedpassword123",
          profile: { create: { firstName: "Fave", lastName: "TesterA" } },
        },
      }),
      prisma.user.create({
        data: {
          email: testEmailB,
          password: "hashedpassword123",
          profile: { create: { firstName: "Fave", lastName: "TesterB" } },
        },
      }),
    ]);
    userAId = userA.id;
    userBId = userB.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-favorite-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
        classificationStatus: "COMPLETED",
      },
    });
    jobListingId = jobListing.id;
  });

  afterAll(async () => {
    await prisma.jobFavorite
      .deleteMany({ where: { jobListingId } })
      .catch(() => {});
    await prisma.jobListing
      .delete({ where: { id: jobListingId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: userAId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userBId } }).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function putFavorite(userId: string, favorite: boolean) {
    mockAuth.mockResolvedValue({
      user: { id: userId, email: "unused@example.com", role: "USER" },
      expires: "any",
    });
    const req = new Request(
      `http://localhost:3000/api/jobs/${jobListingId}/favorite`,
      { method: "PUT", body: JSON.stringify({ favorite }) },
    );
    return putFavoriteHandler(req, {
      params: Promise.resolve({ id: jobListingId }),
    });
  }

  it("set then unset is idempotent each time", async () => {
    // Set true twice — idempotent, no error, no duplicate row.
    const setRes1 = await putFavorite(userAId, true);
    expect(setRes1.status).toBe(200);
    expect(await setRes1.json()).toEqual({ jobListingId, favorite: true });

    const setRes2 = await putFavorite(userAId, true);
    expect(setRes2.status).toBe(200);
    expect(await setRes2.json()).toEqual({ jobListingId, favorite: true });

    const profileA = await prisma.userProfile.findUnique({
      where: { userId: userAId },
    });
    const favRowsAfterSet = await prisma.jobFavorite.findMany({
      where: { profileId: profileA!.id, jobListingId },
    });
    expect(favRowsAfterSet).toHaveLength(1);

    // Unset twice — idempotent, no error.
    const unsetRes1 = await putFavorite(userAId, false);
    expect(unsetRes1.status).toBe(200);
    expect(await unsetRes1.json()).toEqual({ jobListingId, favorite: false });

    const unsetRes2 = await putFavorite(userAId, false);
    expect(unsetRes2.status).toBe(200);
    expect(await unsetRes2.json()).toEqual({ jobListingId, favorite: false });

    const favRowsAfterUnset = await prisma.jobFavorite.findMany({
      where: { profileId: profileA!.id, jobListingId },
    });
    expect(favRowsAfterUnset).toHaveLength(0);
  });

  it("favoriting as one profile does not affect another profile's GET /api/jobs favorite flag", async () => {
    await putFavorite(userAId, true);

    mockAuth.mockResolvedValue({
      user: { id: userBId, email: "unused-b@example.com", role: "USER" },
      expires: "any",
    });
    const jobsRes = await getJobsHandler(
      new Request("http://localhost:3000/api/jobs?days=3650&limit=200"),
    );
    expect(jobsRes.status).toBe(200);
    const jobs = (await jobsRes.json()) as Array<{
      id: string;
      favorite: boolean;
    }>;
    const job = jobs.find((j) => j.id === jobListingId);
    expect(job?.favorite).toBe(false);

    // Cleanup A's favorite for isolation with other tests.
    await putFavorite(userAId, false);
  });

  it("limit is clamped to 100 end-to-end through the Favorites IN(...) lookup (REM-12, AC.12)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: userAId, email: "unused@example.com", role: "USER" },
      expires: "any",
    });

    const clampBatchId = `clamp-${Date.now()}`;
    // Anchor far in the future so this batch's 102 rows always rank strictly above any other
    // JobListing already in the shared local DB, keeping the top-100 ordering deterministic
    // regardless of other tests' fixture data.
    const anchor = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const listings = Array.from({ length: 102 }, (_, i) => ({
      portalId: "test-portal",
      externalJobId: `${clampBatchId}-${i}`,
      title: `Clamp Test Job ${i}`,
      company: "Test Company",
      url: `https://example.com/job/${clampBatchId}-${i}`,
      classificationStatus: "COMPLETED" as const,
      // Descending postedAt so index 0 is the most recent (rank 1) and index 101 is the
      // oldest (rank 102 — guaranteed outside a clamped-to-100 result set).
      postedAt: new Date(anchor - i * 60_000),
    }));
    await prisma.jobListing.createMany({ data: listings });

    const created = await prisma.jobListing.findMany({
      where: { externalJobId: { startsWith: clampBatchId } },
      select: { id: true, externalJobId: true },
    });
    const idByExternalId = new Map(created.map((j) => [j.externalJobId, j.id]));
    const insideClampId = idByExternalId.get(`${clampBatchId}-5`)!; // rank 6 — well inside top 100
    const outsideClampId = idByExternalId.get(`${clampBatchId}-101`)!; // rank 102 — outside top 100

    const profileA = await prisma.userProfile.findUnique({
      where: { userId: userAId },
    });
    await prisma.jobFavorite.createMany({
      data: [
        { profileId: profileA!.id, jobListingId: insideClampId },
        { profileId: profileA!.id, jobListingId: outsideClampId },
      ],
    });

    try {
      const res = await getJobsHandler(
        new Request("http://localhost:3000/api/jobs?days=3650&limit=500"),
      );
      expect(res.status).toBe(200);
      const jobs = (await res.json()) as Array<{
        id: string;
        favorite: boolean;
      }>;

      // Clamp enforced: `limit=500` never yields more than 100 rows.
      expect(jobs.length).toBeLessThanOrEqual(100);

      // The favorited job inside the clamped top-100 window is present and correctly flagged —
      // proves the Favorites IN(...) lookup ran correctly against the clamped result set.
      const insideJob = jobs.find((j) => j.id === insideClampId);
      expect(insideJob?.favorite).toBe(true);

      // The favorited job that falls outside the clamped top-100 window never appears in the
      // response — proves the clamp bounds the candidate set the IN(...) lookup itself operates
      // on, not merely the final response shape.
      expect(jobs.find((j) => j.id === outsideClampId)).toBeUndefined();
    } finally {
      await prisma.jobFavorite.deleteMany({
        where: { jobListingId: { in: [insideClampId, outsideClampId] } },
      });
      await prisma.jobListing.deleteMany({
        where: { externalJobId: { startsWith: clampBatchId } },
      });
    }
  });

  it("falls back to the default limit (does not 500) when `limit` is non-numeric (REM follow-up: NaN guard)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: userAId, email: "unused@example.com", role: "USER" },
      expires: "any",
    });

    const res = await getJobsHandler(
      new Request("http://localhost:3000/api/jobs?days=3650&limit=abc"),
    );

    // `parseInt("abc", 10)` is NaN — must be guarded and fall back to a sane default instead of
    // reaching Math.max/Math.min/the raw SQL LIMIT as NaN (which previously produced a 500).
    expect(res.status).toBe(200);
    const jobs = (await res.json()) as Array<{ id: string }>;
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeLessThanOrEqual(100);
  });

  it("404s for a jobListingId that does not exist", async () => {
    mockAuth.mockResolvedValue({
      user: { id: userAId, email: "unused@example.com", role: "USER" },
      expires: "any",
    });
    const req = new Request(
      "http://localhost:3000/api/jobs/nonexistent-job-id/favorite",
      { method: "PUT", body: JSON.stringify({ favorite: true }) },
    );
    const res = await putFavoriteHandler(req, {
      params: Promise.resolve({ id: "nonexistent-job-id" }),
    });
    expect(res.status).toBe(404);
  });
});
