/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as stageHandler } from "@/app/api/applications/[applicationId]/stage/route";
import { POST as undoHandler } from "@/app/api/applications/[applicationId]/undo/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("POST /api/applications/[applicationId]/undo — revert most recent transition (009 US2, FR-8, AC.3)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-undo-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Undo", lastName: "Tester" } },
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

  async function createApplication() {
    // Fresh JobListing per Application — CV carries a `@@unique([profileId, jobListingId])`
    // constraint.
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-undo-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
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

  async function transition(applicationId: string, body: unknown) {
    const req = new Request(
      `http://localhost:3000/api/applications/${applicationId}/stage`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const res = await stageHandler(req, {
      params: Promise.resolve({ applicationId }),
    });
    return res.json();
  }

  function postUndo(applicationId: string, eventId: string) {
    const req = new Request(
      `http://localhost:3000/api/applications/${applicationId}/undo`,
      { method: "POST", body: JSON.stringify({ eventId }) },
    );
    return undoHandler(req, { params: Promise.resolve({ applicationId }) });
  }

  it("reverts stage and deletes the event immediately after a transition (AC.3)", async () => {
    const application = await createApplication();
    const { eventId } = await transition(application.id, {
      stage: "SCREENING",
    });

    const res = await postUndo(application.id, eventId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("APPLIED");

    const eventStillExists = await prisma.applicationEvent.findUnique({
      where: { id: eventId },
    });
    expect(eventStillExists).toBeNull();

    const persisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(persisted?.stage).toBe("APPLIED");
  });

  it("a second undo call with the same (now-stale) eventId → 409 (AC.3)", async () => {
    const application = await createApplication();
    const { eventId } = await transition(application.id, {
      stage: "SCREENING",
    });

    const first = await postUndo(application.id, eventId);
    expect(first.status).toBe(200);

    const second = await postUndo(application.id, eventId);
    expect(second.status).toBe(409);
  });

  it("undo of a transition superseded by a newer transition → 409", async () => {
    const application = await createApplication();
    const { eventId: firstEventId } = await transition(application.id, {
      stage: "SCREENING",
    });
    await transition(application.id, { stage: "TECH_INTERVIEW" });

    const res = await postUndo(application.id, firstEventId);
    expect(res.status).toBe(409);

    const persisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(persisted?.stage).toBe("TECH_INTERVIEW");
  });

  it("FINAL/outcome: HIRED → transition out → undo restores the prior outcome, not null (REM-4, AC.4)", async () => {
    const application = await createApplication();
    await transition(application.id, { stage: "FINAL", outcome: "HIRED" });

    const finalPersisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(finalPersisted?.stage).toBe("FINAL");
    expect(finalPersisted?.outcome).toBe("HIRED");

    const { eventId } = await transition(application.id, {
      stage: "OFFER",
    });

    const leavingFinalEvent = await prisma.applicationEvent.findUnique({
      where: { id: eventId },
    });
    expect(leavingFinalEvent?.previousOutcome).toBe("HIRED");

    const afterLeaving = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(afterLeaving?.outcome).toBeNull();

    const res = await postUndo(application.id, eventId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("FINAL");
    expect(body.outcome).toBe("HIRED");

    const restored = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(restored?.stage).toBe("FINAL");
    expect(restored?.outcome).toBe("HIRED");
  });
});
