/**
 * @jest-environment node
 */
import "dotenv/config";
import { PUT as putSnapshotHandler } from "@/app/api/cv/[cvId]/snapshot/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

function makeSnapshot(overrides: Partial<CVSnapshotData> = {}): CVSnapshotData {
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
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    ...overrides,
  };
}

describe("PUT /api/cv/[cvId]/snapshot — autosave (DRAFT-only)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-snapshot-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;
  let draftCvId: string;
  let appliedCvId: string;
  const jobListingIds: string[] = [];

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
        externalJobId: `test-job-snapshot-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingId = jobListing.id;
    jobListingIds.push(jobListing.id);

    const draftCv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId,
        name: "Draft CV",
        status: "DRAFT",
        snapshotData: makeSnapshot() as unknown as object,
      },
    });
    draftCvId = draftCv.id;

    const jobListing2 = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-snapshot-applied-${Date.now()}`,
        title: "Frontend Engineer",
        company: "Test Company",
        url: "https://example.com/job2",
      },
    });
    jobListingIds.push(jobListing2.id);

    const appliedCv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing2.id,
        name: "Applied CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: makeSnapshot() as unknown as object,
      },
    });
    appliedCvId = appliedCv.id;
  });

  afterAll(async () => {
    await safeCleanup("cv-snapshot afterAll user", async () =>
      prisma.user.delete({ where: { id: testUserId } }),
    );
    await safeCleanup("cv-snapshot afterAll jobListings", async () =>
      prisma.jobListing.deleteMany({ where: { id: { in: jobListingIds } } }),
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

  it("saves a valid snapshot atomically for a DRAFT CV", async () => {
    const nextSnapshot = makeSnapshot({
      basicData: {
        firstName: "Janet",
        lastName: "Doe",
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        website: null,
        title: null,
      },
    });

    const req = new Request(
      `http://localhost:3000/api/cv/${draftCvId}/snapshot`,
      { method: "PUT", body: JSON.stringify(nextSnapshot) },
    );
    const res = await putSnapshotHandler(req, {
      params: Promise.resolve({ cvId: draftCvId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.savedAt).toBeDefined();

    const stored = await prisma.cV.findUnique({ where: { id: draftCvId } });
    expect(
      (stored?.snapshotData as unknown as CVSnapshotData).basicData.firstName,
    ).toBe("Janet");
  });

  it("returns 409 on an APPLIED CV and leaves the snapshot unchanged", async () => {
    const before = await prisma.cV.findUnique({ where: { id: appliedCvId } });

    const attemptedSnapshot = makeSnapshot({
      basicData: {
        firstName: "Should Not Persist",
        lastName: "Doe",
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        website: null,
        title: null,
      },
    });

    const req = new Request(
      `http://localhost:3000/api/cv/${appliedCvId}/snapshot`,
      { method: "PUT", body: JSON.stringify(attemptedSnapshot) },
    );
    const res = await putSnapshotHandler(req, {
      params: Promise.resolve({ cvId: appliedCvId }),
    });
    expect(res.status).toBe(409);

    const after = await prisma.cV.findUnique({ where: { id: appliedCvId } });
    expect(after?.snapshotData).toEqual(before?.snapshotData);
  });

  it("returns 400 with no partial write on an invalid payload", async () => {
    const before = await prisma.cV.findUnique({ where: { id: draftCvId } });

    const req = new Request(
      `http://localhost:3000/api/cv/${draftCvId}/snapshot`,
      { method: "PUT", body: JSON.stringify({ version: 1 }) },
    );
    const res = await putSnapshotHandler(req, {
      params: Promise.resolve({ cvId: draftCvId }),
    });
    expect(res.status).toBe(400);

    const after = await prisma.cV.findUnique({ where: { id: draftCvId } });
    expect(after?.snapshotData).toEqual(before?.snapshotData);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request(
      `http://localhost:3000/api/cv/${draftCvId}/snapshot`,
      { method: "PUT", body: JSON.stringify(makeSnapshot()) },
    );
    const res = await putSnapshotHandler(req, {
      params: Promise.resolve({ cvId: draftCvId }),
    });
    expect(res.status).toBe(401);
  });

  describe("atomic APPLIED guard (race condition fix)", () => {
    it("returns 409 from the updateMany guard even when the pre-check's findUnique is fooled into seeing DRAFT (simulates a concurrent apply committing after the pre-check)", async () => {
      const jobListing = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `test-job-snapshot-guard-${Date.now()}`,
          title: "Backend Engineer",
          company: "Test Company",
          url: "https://example.com/job-guard",
        },
      });
      jobListingIds.push(jobListing.id);
      const guardCv = await prisma.cV.create({
        data: {
          profileId: testProfileId,
          jobListingId: jobListing.id,
          name: "Guard CV",
          status: "DRAFT",
          snapshotData: makeSnapshot() as unknown as object,
        },
      });

      // Really APPLIED in the DB (as if a concurrent `POST /apply` committed right after the
      // route's pre-check ran) but the pre-check's `findUnique` is spied to still report DRAFT —
      // this isolates the atomic `updateMany({ where: { status: { not: "APPLIED" } } })` guard as
      // the thing under test, proving it independently rejects the write instead of relying on
      // the (now-stale) pre-check.
      await prisma.cV.update({
        where: { id: guardCv.id },
        data: { status: "APPLIED", appliedAt: new Date() },
      });

      const realCv = await prisma.cV.findUnique({
        where: { id: guardCv.id },
        include: { profile: true },
      });
      const findUniqueSpy = jest
        .spyOn(prisma.cV, "findUnique")
        .mockResolvedValueOnce({
          ...realCv,
          status: "DRAFT",
        } as unknown as Awaited<ReturnType<typeof prisma.cV.findUnique>>);

      const req = new Request(
        `http://localhost:3000/api/cv/${guardCv.id}/snapshot`,
        {
          method: "PUT",
          body: JSON.stringify(
            makeSnapshot({
              basicData: {
                firstName: "Should Not Persist",
                lastName: "Doe",
                phone: null,
                location: null,
                linkedin: null,
                github: null,
                website: null,
                title: null,
              },
            }),
          ),
        },
      );
      const res = await putSnapshotHandler(req, {
        params: Promise.resolve({ cvId: guardCv.id }),
      });
      expect(res.status).toBe(409);

      findUniqueSpy.mockRestore();

      const after = await prisma.cV.findUnique({ where: { id: guardCv.id } });
      expect(
        (after?.snapshotData as unknown as CVSnapshotData).basicData.firstName,
      ).not.toBe("Should Not Persist");
    });
  });
});
