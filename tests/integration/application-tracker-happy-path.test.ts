/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as createCVHandler } from "@/app/api/cv/route";
import { POST as applyHandler } from "@/app/api/cv/[cvId]/apply/route";
import { GET as getBoardHandler } from "@/app/api/applications/route";
import { POST as stageHandler } from "@/app/api/applications/[applicationId]/stage/route";
import { POST as eventsHandler } from "@/app/api/applications/[applicationId]/events/route";
import { GET as getForCVHandler } from "@/app/api/cv/[cvId]/application/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

// MODIFIED PER TICKET INSTRUCTION (T050): the task originally specified a Cypress E2E spec
// (applyCopilot/cypress/e2e/application-tracker-happy-path.cy.ts), but this repo has no Cypress
// installed/configured anywhere (no cypress/ dir, no cypress devDependency). Per the ticket's
// explicit deviation instruction, this is written as a Jest integration test covering the exact
// same end-to-end assertions by chaining real HTTP-style requests through the actual route
// handlers — the same pattern `cv-composer-happy-path.test.ts` (T049 in `007`) established for
// an identical Cypress-not-available situation.

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("Application Tracker happy path — apply, board, drag through stages, timeline (009, SC-1, SC-2, SC-5)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `application-tracker-happy-path-${Date.now()}@example.com`;
  let testUserId: string;
  let jobListingId: string;
  let cvId: string;
  let applicationId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Happy", lastName: "Path" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-happy-path-tracker-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
        fullDescription: "Own our backend platform end to end.",
      },
    });
    jobListingId = jobListing.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.jobListing
      .delete({ where: { id: jobListingId } })
      .catch(() => {});
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

  it("applies a CV, drags the resulting Application through stages, and confirms the full timeline", async () => {
    // 1. Create CV (idempotent create-or-get, cloned from the live Profile).
    const createRes = await createCVHandler(
      new Request("http://localhost:3000/api/cv", {
        method: "POST",
        body: JSON.stringify({ jobListingId }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    cvId = created.id;
    expect(created.status).toBe("DRAFT");

    // 2. Apply the CV — creates the Application in the Applied stage (US1, AC.1).
    const applyRes = await applyHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/apply`, {
        method: "POST",
      }),
      { params: Promise.resolve({ cvId }) },
    );
    expect(applyRes.status).toBe(200);
    const applyBody = await applyRes.json();
    applicationId = applyBody.applicationId;
    expect(applicationId).toBeTruthy();

    // 3. Confirm it appears on the Board, in the Applied column.
    const boardRes = await getBoardHandler();
    expect(boardRes.status).toBe(200);
    const boardBody = await boardRes.json();
    const boardCard = boardBody.applications.find(
      (a: { id: string }) => a.id === applicationId,
    );
    expect(boardCard).toBeDefined();
    expect(boardCard.stage).toBe("APPLIED");

    // 4. Drag it to Tech Interview (simulated drag-and-drop calling the shared stage endpoint).
    const toTechInterviewRes = await stageHandler(
      new Request(
        `http://localhost:3000/api/applications/${applicationId}/stage`,
        { method: "POST", body: JSON.stringify({ stage: "TECH_INTERVIEW" }) },
      ),
      { params: Promise.resolve({ applicationId }) },
    );
    expect(toTechInterviewRes.status).toBe(200);
    const toTechInterviewBody = await toTechInterviewRes.json();
    expect(toTechInterviewBody.stage).toBe("TECH_INTERVIEW");

    // 5. Drag it to Final with an outcome (US3, AC.4 — requires an outcome to complete).
    const toFinalRes = await stageHandler(
      new Request(
        `http://localhost:3000/api/applications/${applicationId}/stage`,
        {
          method: "POST",
          body: JSON.stringify({ stage: "FINAL", outcome: "HIRED" }),
        },
      ),
      { params: Promise.resolve({ applicationId }) },
    );
    expect(toFinalRes.status).toBe(200);
    const toFinalBody = await toFinalRes.json();
    expect(toFinalBody.stage).toBe("FINAL");
    expect(toFinalBody.outcome).toBe("HIRED");

    // 6. Open the Application tab — add one note, one meeting/event, one company response
    // (US4, AC.5, AC.6).
    const noteRes = await eventsHandler(
      new Request(
        `http://localhost:3000/api/applications/${applicationId}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "NOTE",
            content: "Recruiter reached out on LinkedIn.",
          }),
        },
      ),
      { params: Promise.resolve({ applicationId }) },
    );
    expect(noteRes.status).toBe(201);

    const meetingRes = await eventsHandler(
      new Request(
        `http://localhost:3000/api/applications/${applicationId}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "MEETING",
            title: "Onsite interview",
            eventAt: "2026-08-12T14:00:00.000Z",
            content: "Panel round",
          }),
        },
      ),
      { params: Promise.resolve({ applicationId }) },
    );
    expect(meetingRes.status).toBe(201);

    const companyResponseRes = await eventsHandler(
      new Request(
        `http://localhost:3000/api/applications/${applicationId}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "COMPANY_RESPONSE",
            content: "We'd like to extend an offer.",
          }),
        },
      ),
      { params: Promise.resolve({ applicationId }) },
    );
    expect(companyResponseRes.status).toBe(201);

    // 7. Confirm the timeline shows every entry, automatic AND manual, in chronological order.
    const timelineRes = await getForCVHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/application`),
      { params: Promise.resolve({ cvId }) },
    );
    expect(timelineRes.status).toBe(200);
    const timelineBody = await timelineRes.json();
    expect(timelineBody.application.id).toBe(applicationId);
    expect(timelineBody.application.stage).toBe("FINAL");
    expect(timelineBody.application.outcome).toBe("HIRED");

    const types = timelineBody.events.map((e: { type: string }) => e.type);
    // 3 automatic STAGE_CHANGE events (Applied, Tech Interview, Final) + 3 manual entries.
    expect(types).toEqual([
      "STAGE_CHANGE",
      "STAGE_CHANGE",
      "STAGE_CHANGE",
      "NOTE",
      "MEETING",
      "COMPANY_RESPONSE",
    ]);

    const createdAts = timelineBody.events.map((e: { createdAt: string }) =>
      new Date(e.createdAt).getTime(),
    );
    const sorted = [...createdAts].sort((a, b) => a - b);
    expect(createdAts).toEqual(sorted);
  });
});
