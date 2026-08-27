/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as stageHandler } from "@/app/api/applications/[applicationId]/stage/route";
import { POST as eventsHandler } from "@/app/api/applications/[applicationId]/events/route";
import { GET as cvApplicationHandler } from "@/app/api/cv/[cvId]/application/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";
import {
  transitionStage,
  undoTransition,
  addManualEvent,
  OwnershipViolationError,
} from "@/services/applicationService";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("POST /api/applications/[applicationId]/events — manual timeline entry (009 US4, AC.5, AC.6)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-events-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  const jobListingIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Events", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    // Pool/connection teardown happens once, in the LAST describe block in this file (see
    // AC.11 block below) — Jest runs describe blocks within a file sequentially, so closing
    // the shared `pool`/`prisma` connection here would break the later blocks.
    await safeCleanup("application-events: delete testUser", async () => {
      await prisma.user.delete({ where: { id: testUserId } });
    });
    await safeCleanup("application-events: delete jobListings", async () => {
      await prisma.jobListing.deleteMany({
        where: { id: { in: jobListingIds } },
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  async function createApplication() {
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-events-${Date.now()}-${Math.random()}`,
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
    return { application, cv };
  }

  function postEvent(applicationId: string, body: unknown) {
    const req = new Request(
      `http://localhost:3000/api/applications/${applicationId}/events`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return eventsHandler(req, { params: Promise.resolve({ applicationId }) });
  }

  function getForCV(cvId: string) {
    const req = new Request(`http://localhost:3000/api/cv/${cvId}/application`);
    return cvApplicationHandler(req, { params: Promise.resolve({ cvId }) });
  }

  it("posts each of the 3 manual types → 201, and a subsequent GET returns automatic + manual events in createdAt order (AC.5, AC.6)", async () => {
    const { application, cv } = await createApplication();

    const noteRes = await postEvent(application.id, {
      type: "NOTE",
      content: "Recruiter reached out on LinkedIn.",
    });
    expect(noteRes.status).toBe(201);

    const meetingRes = await postEvent(application.id, {
      type: "MEETING",
      title: "Phone screen",
      eventAt: "2026-08-10T14:00:00.000Z",
      content: "30 min with recruiter",
    });
    expect(meetingRes.status).toBe(201);
    const meetingBody = await meetingRes.json();
    expect(meetingBody.title).toBe("Phone screen");
    expect(meetingBody.eventAt).toBe("2026-08-10T14:00:00.000Z");

    const companyResponseRes = await postEvent(application.id, {
      type: "COMPANY_RESPONSE",
      content: "We'd like to move forward.",
    });
    expect(companyResponseRes.status).toBe(201);

    const getRes = await getForCV(cv.id);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.application.id).toBe(application.id);
    expect(body.events).toHaveLength(4); // 1 automatic STAGE_CHANGE + 3 manual

    const types = body.events.map((e: { type: string }) => e.type);
    expect(types).toEqual([
      "STAGE_CHANGE",
      "NOTE",
      "MEETING",
      "COMPANY_RESPONSE",
    ]);

    // Ordered ascending by createdAt.
    const createdAts = body.events.map((e: { createdAt: string }) =>
      new Date(e.createdAt).getTime(),
    );
    const sorted = [...createdAts].sort((a, b) => a - b);
    expect(createdAts).toEqual(sorted);
  });

  it("MEETING missing eventAt → 400, no partial row written", async () => {
    const { application } = await createApplication();

    const res = await postEvent(application.id, {
      type: "MEETING",
      title: "Missing date",
    });
    expect(res.status).toBe(400);

    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: application.id, type: "MEETING" },
    });
    expect(events).toHaveLength(0);
  });
});

describe("GET /api/cv/[cvId]/application — Tab 5 read (009 US4, FR-12)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-cv-get-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  const jobListingIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "CvGet", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    // See the events block's afterAll note — teardown happens once, in this file's last block.
    await safeCleanup(
      "application-events: delete testUser (cv-get)",
      async () => {
        await prisma.user.delete({ where: { id: testUserId } });
      },
    );
    await safeCleanup(
      "application-events: delete jobListings (cv-get)",
      async () => {
        await prisma.jobListing.deleteMany({
          where: { id: { in: jobListingIds } },
        });
      },
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  it("404s with 'No Application yet for this CV' for a still-DRAFT CV", async () => {
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-cv-get-${Date.now()}-${Math.random()}`,
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
        status: "DRAFT",
        snapshotData: {},
      },
    });

    const req = new Request(
      `http://localhost:3000/api/cv/${cv.id}/application`,
    );
    const res = await cvApplicationHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No Application yet for this CV");
  });
});

describe("AC.11 — Undo + further timeline changes never touch CV.snapshotData/status (009 US4)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-ac11-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  const jobListingIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Ac11", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    // Pool/connection teardown happens once, in the LAST describe block in this file (see the
    // ownership-violation block below) — Jest runs describe blocks within a file sequentially,
    // so closing the shared `pool`/`prisma` connection here would break that later block.
    await safeCleanup(
      "application-events: delete testUser (ac11)",
      async () => {
        await prisma.user.delete({ where: { id: testUserId } });
      },
    );
    await safeCleanup(
      "application-events: delete jobListings (ac11)",
      async () => {
        await prisma.jobListing.deleteMany({
          where: { id: { in: jobListingIds } },
        });
      },
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  it("CV.snapshotData/status remain unchanged through a stage transition, an Undo, and a manual event", async () => {
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-ac11-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingIds.push(jobListing.id);
    const originalSnapshot = { version: 1, basicData: { firstName: "Ac11" } };
    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Test CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: originalSnapshot,
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

    // Transition, then Undo it.
    const { POST: undoHandler } =
      await import("@/app/api/applications/[applicationId]/undo/route");
    const stageReq = new Request(
      `http://localhost:3000/api/applications/${application.id}/stage`,
      { method: "POST", body: JSON.stringify({ stage: "SCREENING" }) },
    );
    const stageRes = await stageHandler(stageReq, {
      params: Promise.resolve({ applicationId: application.id }),
    });
    const { eventId } = await stageRes.json();

    const undoRes = await undoHandler(
      new Request(
        `http://localhost:3000/api/applications/${application.id}/undo`,
        { method: "POST", body: JSON.stringify({ eventId }) },
      ),
      { params: Promise.resolve({ applicationId: application.id }) },
    );
    expect(undoRes.status).toBe(200);

    // Further timeline change after Undo.
    const noteRes = await postEvent(application.id, {
      type: "NOTE",
      content: "Post-undo note.",
    });
    expect(noteRes.status).toBe(201);

    const getRes = await getForCV(cv.id);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.events.length).toBeGreaterThanOrEqual(2);

    const persistedCV = await prisma.cV.findUnique({ where: { id: cv.id } });
    expect(persistedCV?.status).toBe("APPLIED");
    expect(persistedCV?.snapshotData).toEqual(originalSnapshot);
  });

  function postEvent(applicationId: string, body: unknown) {
    const req = new Request(
      `http://localhost:3000/api/applications/${applicationId}/events`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return eventsHandler(req, { params: Promise.resolve({ applicationId }) });
  }

  function getForCV(cvId: string) {
    const req = new Request(`http://localhost:3000/api/cv/${cvId}/application`);
    return cvApplicationHandler(req, { params: Promise.resolve({ cvId }) });
  }
});

describe("applicationService — direct-call ownership violation (REM-8, AC.8)", () => {
  const ownerEmail = `application-ownership-owner-${Date.now()}@example.com`;
  const attackerEmail = `application-ownership-attacker-${Date.now()}@example.com`;
  let ownerUserId: string;
  let ownerProfileId: string;
  let attackerUserId: string;
  const jobListingIds: string[] = [];

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Owner", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    ownerUserId = owner.id;
    ownerProfileId = owner.profile!.id;

    const attacker = await prisma.user.create({
      data: {
        email: attackerEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Attacker", lastName: "Tester" } },
      },
    });
    attackerUserId = attacker.id;
  });

  afterAll(async () => {
    await safeCleanup("application-events: delete ownerUser", async () => {
      await prisma.user.delete({ where: { id: ownerUserId } });
    });
    await safeCleanup("application-events: delete attackerUser", async () => {
      await prisma.user.delete({ where: { id: attackerUserId } });
    });
    await safeCleanup(
      "application-events: delete jobListings (ownership)",
      async () => {
        await prisma.jobListing.deleteMany({
          where: { id: { in: jobListingIds } },
        });
      },
    );
    await prisma.$disconnect();
    await pool.end();
  });

  async function createOwnedApplication() {
    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-application-ownership-${Date.now()}-${Math.random()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingIds.push(jobListing.id);
    const cv = await prisma.cV.create({
      data: {
        profileId: ownerProfileId,
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
        profileId: ownerProfileId,
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

  it("transitionStage rejects a caller who does not own the Application, called directly (bypassing the route)", async () => {
    const application = await createOwnedApplication();

    await expect(
      transitionStage(application.id, attackerUserId, { stage: "SCREENING" }),
    ).rejects.toThrow(OwnershipViolationError);

    const persisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(persisted?.stage).toBe("APPLIED");
  });

  it("undoTransition rejects a caller who does not own the Application, called directly (bypassing the route)", async () => {
    const application = await createOwnedApplication();
    const { eventId } = await transitionStage(application.id, ownerUserId, {
      stage: "SCREENING",
    });

    await expect(
      undoTransition(application.id, attackerUserId, eventId),
    ).rejects.toThrow(OwnershipViolationError);

    const persisted = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(persisted?.stage).toBe("SCREENING");

    const eventStillExists = await prisma.applicationEvent.findUnique({
      where: { id: eventId },
    });
    expect(eventStillExists).not.toBeNull();
  });

  it("addManualEvent rejects a caller who does not own the Application, called directly (bypassing the route)", async () => {
    const application = await createOwnedApplication();

    await expect(
      addManualEvent(application.id, attackerUserId, {
        type: "NOTE",
        content: "Should never be written",
      }),
    ).rejects.toThrow(OwnershipViolationError);

    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: application.id, type: "NOTE" },
    });
    expect(events).toHaveLength(0);
  });
});
