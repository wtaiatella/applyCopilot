/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as pdfHandler } from "@/app/api/cv/[cvId]/pdf/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

function snapshotWithContent(): CVSnapshotData {
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
      title: "Engineer",
    },
    summaries: [],
    experiences: [
      {
        id: "e1",
        sourceExperienceId: "e1",
        company: "Acme",
        position: "Engineer",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: null,
        freeFormContext: [],
        bullets: [
          {
            id: "b1",
            sourceBulletId: "b1",
            text: "Shipped features",
            type: "BULLET",
            included: true,
            sortOrder: 0,
          },
          {
            id: "b2",
            sourceBulletId: "b2",
            text: "Excluded from export",
            type: "BULLET",
            included: false,
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

describe("GET /api/cv/[cvId]/pdf — repeatable, no status change (AC.7)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-pdf-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let cvId: string;
  let jobListingId: string;

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
        externalJobId: `test-job-pdf-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingId = jobListing.id;

    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId,
        name: "PDF Test CV",
        status: "DRAFT",
        snapshotData: snapshotWithContent() as unknown as object,
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

  it("returns a PDF and leaves status/snapshotData unchanged, called twice", async () => {
    const before = await prisma.cV.findUnique({ where: { id: cvId } });

    const req1 = new Request(`http://localhost:3000/api/cv/${cvId}/pdf`);
    const res1 = await pdfHandler(req1, { params: Promise.resolve({ cvId }) });
    expect(res1.status).toBe(200);
    expect(res1.headers.get("Content-Type")).toBe("application/pdf");
    const buffer1 = Buffer.from(await res1.arrayBuffer());
    expect(buffer1.length).toBeGreaterThan(0);

    const req2 = new Request(`http://localhost:3000/api/cv/${cvId}/pdf`);
    const res2 = await pdfHandler(req2, { params: Promise.resolve({ cvId }) });
    expect(res2.status).toBe(200);
    const buffer2 = Buffer.from(await res2.arrayBuffer());
    expect(buffer2.length).toBeGreaterThan(0);

    const after = await prisma.cV.findUnique({ where: { id: cvId } });
    expect(after?.status).toBe(before?.status);
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(after?.snapshotData).toEqual(before?.snapshotData);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request(`http://localhost:3000/api/cv/${cvId}/pdf`);
    const res = await pdfHandler(req, { params: Promise.resolve({ cvId }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a CV that does not belong to the requesting user", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `cv-pdf-other-${Date.now()}@example.com`,
        password: "hashedpassword123",
        profile: { create: { firstName: "Other" } },
      },
    });
    mockAuth.mockResolvedValue({
      user: { id: otherUser.id, email: otherUser.email, role: "USER" },
      expires: "any",
    });

    const req = new Request(`http://localhost:3000/api/cv/${cvId}/pdf`);
    const res = await pdfHandler(req, { params: Promise.resolve({ cvId }) });
    expect(res.status).toBe(404);

    await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
  });
});
