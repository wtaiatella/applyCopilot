/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as resetCVHandler } from "@/app/api/cv/[cvId]/reset/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

function emptySnapshot(): CVSnapshotData {
  return {
    version: 1,
    basicData: {
      firstName: null,
      lastName: null,
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
  };
}

describe("POST /api/cv/[cvId]/reset — re-clone from live Profile (DRAFT-only)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-reset-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let draftCvId: string;
  let appliedCvId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: { firstName: "Reset", lastName: "Tester" },
        },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Acme",
        position: "Engineer",
        startDate: new Date("2021-01-01"),
        current: true,
        bullets: {
          create: [
            { text: "Live profile bullet", type: "BULLET", sortOrder: 0 },
          ],
        },
      },
    });

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-reset-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });

    const draftCv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Draft CV",
        status: "DRAFT",
        // Edited/tailored state, deliberately empty — reset should re-clone real content.
        snapshotData: emptySnapshot() as unknown as object,
      },
    });
    draftCvId = draftCv.id;

    const jobListing2 = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-reset-applied-${Date.now()}`,
        title: "Frontend Engineer",
        company: "Test Company",
        url: "https://example.com/job2",
      },
    });

    const appliedCv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing2.id,
        name: "Applied CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: emptySnapshot() as unknown as object,
      },
    });
    appliedCvId = appliedCv.id;
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

  it("re-clones from the live Profile while DRAFT, discarding prior edits", async () => {
    const req = new Request(`http://localhost:3000/api/cv/${draftCvId}/reset`, {
      method: "POST",
    });
    const res = await resetCVHandler(req, {
      params: Promise.resolve({ cvId: draftCvId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const snapshotData: CVSnapshotData = data.snapshotData;
    expect(snapshotData.experiences).toHaveLength(1);
    expect(snapshotData.experiences[0].company).toBe("Acme");
    expect(snapshotData.experiences[0].bullets[0].text).toBe(
      "Live profile bullet",
    );

    const stored = await prisma.cV.findUnique({ where: { id: draftCvId } });
    expect(
      (stored?.snapshotData as unknown as CVSnapshotData).experiences,
    ).toHaveLength(1);
  });

  it("returns 409 once APPLIED", async () => {
    const req = new Request(
      `http://localhost:3000/api/cv/${appliedCvId}/reset`,
      { method: "POST" },
    );
    const res = await resetCVHandler(req, {
      params: Promise.resolve({ cvId: appliedCvId }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request(`http://localhost:3000/api/cv/${draftCvId}/reset`, {
      method: "POST",
    });
    const res = await resetCVHandler(req, {
      params: Promise.resolve({ cvId: draftCvId }),
    });
    expect(res.status).toBe(401);
  });

  describe("atomic APPLIED guard (race condition fix)", () => {
    it("returns 409 from the updateMany guard even when the pre-check's findUnique is fooled into seeing DRAFT (simulates a concurrent apply committing after the pre-check)", async () => {
      const jobListing = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `test-job-reset-guard-${Date.now()}`,
          title: "Backend Engineer",
          company: "Test Company",
          url: "https://example.com/job-guard",
        },
      });
      const guardCv = await prisma.cV.create({
        data: {
          profileId: testProfileId,
          jobListingId: jobListing.id,
          name: "Guard CV",
          status: "DRAFT",
          snapshotData: emptySnapshot() as unknown as object,
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
        `http://localhost:3000/api/cv/${guardCv.id}/reset`,
        { method: "POST" },
      );
      const res = await resetCVHandler(req, {
        params: Promise.resolve({ cvId: guardCv.id }),
      });
      expect(res.status).toBe(409);

      findUniqueSpy.mockRestore();

      const after = await prisma.cV.findUnique({ where: { id: guardCv.id } });
      expect(
        (after?.snapshotData as unknown as CVSnapshotData).experiences,
      ).toHaveLength(0);
    });
  });
});
