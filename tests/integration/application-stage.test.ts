/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as stageHandler } from "@/app/api/applications/[applicationId]/stage/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("POST /api/applications/[applicationId]/stage — dropdown/drag-and-drop transition (009 US2/US3, AC.2, AC.4)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-stage-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  const jobListingIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Stage", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    await safeCleanup("application-stage: delete testUser", async () => {
      await prisma.user.delete({ where: { id: testUserId } });
    });
    await safeCleanup("application-stage: delete jobListings", async () => {
      await prisma.jobListing.deleteMany({
        where: { id: { in: jobListingIds } },
      });
    });
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

  async function createApplication() {
    // Fresh JobListing per Application — CV carries a `@@unique([profileId, jobListingId])`
    // constraint.
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-stage-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingIds.push(jobListing.id);
    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Test CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: {},
      },
    });
    const application = await prisma.application.create({
      data: {
        cvId: cv.id,
        profileId: testProfileId,
        jobListingId: jobListing.id,
        stage: "APPLIED",
      },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "STAGE_CHANGE",
        fromStage: null,
        toStage: "APPLIED",
      },
    });
    return application;
  }

  function postStage(applicationId: string, body: unknown) {
    const req = new Request(
      `http://localhost:3000/api/applications/${applicationId}/stage`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return stageHandler(req, { params: Promise.resolve({ applicationId }) });
  }

  it("dropdown-shaped and drag-and-drop-shaped requests produce an identical resulting stage and event shape (AC.2)", async () => {
    const dropdownApp = await createApplication();
    const dndApp = await createApplication();

    // Both callers send the identical body shape — only the id differs (FR-5).
    const dropdownRes = await postStage(dropdownApp.id, { stage: "SCREENING" });
    const dndRes = await postStage(dndApp.id, { stage: "SCREENING" });

    expect(dropdownRes.status).toBe(200);
    expect(dndRes.status).toBe(200);
    const dropdownBody = await dropdownRes.json();
    const dndBody = await dndRes.json();

    expect(dropdownBody.stage).toBe("SCREENING");
    expect(dndBody.stage).toBe("SCREENING");
    expect(dropdownBody.outcome).toBeNull();
    expect(dndBody.outcome).toBeNull();

    const dropdownEvent = await prisma.applicationEvent.findUnique({
      where: { id: dropdownBody.eventId },
    });
    const dndEvent = await prisma.applicationEvent.findUnique({
      where: { id: dndBody.eventId },
    });
    expect(dropdownEvent?.fromStage).toBe(dndEvent?.fromStage);
    expect(dropdownEvent?.toStage).toBe(dndEvent?.toStage);
  });

  it("transition into FINAL without outcome → 400, stage unchanged (AC.4)", async () => {
    const application = await createApplication();

    const res = await postStage(application.id, { stage: "FINAL" });
    expect(res.status).toBe(400);

    const unchanged = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(unchanged?.stage).toBe("APPLIED");
    expect(unchanged?.outcome).toBeNull();
  });

  it("transition into FINAL with a valid outcome → 200, outcome persisted (AC.4)", async () => {
    const application = await createApplication();

    const res = await postStage(application.id, {
      stage: "FINAL",
      outcome: "HIRED",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("FINAL");
    expect(body.outcome).toBe("HIRED");

    const persisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(persisted?.stage).toBe("FINAL");
    expect(persisted?.outcome).toBe("HIRED");
  });

  it("404s for an Application not owned by the caller", async () => {
    const application = await createApplication();
    mockAuth.mockResolvedValue({
      user: { id: "someone-else", email: "other@example.com", role: "USER" },
      expires: "any",
    });

    const res = await postStage(application.id, { stage: "SCREENING" });
    expect(res.status).toBe(404);
  });
});
