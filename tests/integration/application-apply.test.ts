/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as applyHandler } from "@/app/api/cv/[cvId]/apply/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

const EMPTY_SNAPSHOT: CVSnapshotData = {
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

describe("POST /api/cv/[cvId]/apply — Application auto-creation (009 US1, AC.1)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-apply-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Applic", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
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

  async function createCV() {
    // Fresh JobListing per CV — CV carries a `@@unique([profileId, jobListingId])` constraint.
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-apply-cv-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    return prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Test CV",
        status: "DRAFT",
        snapshotData: EMPTY_SNAPSHOT as unknown as object,
      },
    });
  }

  it("creates exactly one Application (stage: APPLIED) + one STAGE_CHANGE event for a DRAFT CV with no existing Application (AC.1)", async () => {
    const cv = await createCV();

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationId).toBeTruthy();

    const applications = await prisma.application.findMany({
      where: { cvId: cv.id },
    });
    expect(applications).toHaveLength(1);
    expect(applications[0].stage).toBe("APPLIED");
    expect(applications[0].id).toBe(body.applicationId);

    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: applications[0].id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("STAGE_CHANGE");
    expect(events[0].fromStage).toBeNull();
    expect(events[0].toStage).toBe("APPLIED");
  });

  it("re-apply on an already-APPLIED CV still 409s with no duplicate Application (AC.1)", async () => {
    const cv = await createCV();

    const req1 = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res1 = await applyHandler(req1, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res1.status).toBe(200);

    const req2 = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res2 = await applyHandler(req2, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res2.status).toBe(409);

    const applications = await prisma.application.findMany({
      where: { cvId: cv.id },
    });
    expect(applications).toHaveLength(1);
  });
});
