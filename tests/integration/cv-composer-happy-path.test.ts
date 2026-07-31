/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as createCVHandler } from "@/app/api/cv/route";
import { GET as getCVHandler } from "@/app/api/cv/[cvId]/route";
import { PUT as putSnapshotHandler } from "@/app/api/cv/[cvId]/snapshot/route";
import { GET as pdfHandler } from "@/app/api/cv/[cvId]/pdf/route";
import { POST as matchScoreHandler } from "@/app/api/cv/[cvId]/match-score/route";
import { POST as applyHandler } from "@/app/api/cv/[cvId]/apply/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";

// MODIFIED PER USER DECISION: T049 originally specified a Cypress E2E test, but this repo has
// no Cypress installed/configured. This Jest integration test provides equivalent functional
// coverage by chaining real HTTP-style requests through the actual route handlers, following
// the existing tests/integration/ convention (see e.g. cv-apply.test.ts).

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Avoid loading the real TensorFlow USE model for match-score (mirrors cv-match-score.test.ts).
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(512).fill(0.123)),
}));

describe("CV Composer happy-path end-to-end (SC-1, SC-2, AC.11)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-happy-path-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;
  let cvId: string;

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

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-happy-path-${Date.now()}`,
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

  it("creates, tailors, prints, scores, applies, then confirms read-only", async () => {
    // 1. Create CV (idempotent create-or-get, cloned from the live Profile).
    const createReq = new Request("http://localhost:3000/api/cv", {
      method: "POST",
      body: JSON.stringify({ jobListingId }),
    });
    const createRes = await createCVHandler(createReq);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    cvId = created.id;
    expect(created.status).toBe("DRAFT");

    // Fetch the cloned snapshot to get real snapshot-local + source ids to tailor.
    const getRes1 = await getCVHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}`),
      { params: Promise.resolve({ cvId }) },
    );
    expect(getRes1.status).toBe(200);
    const cvBody1 = await getRes1.json();
    const snapshot1: CVSnapshotData = cvBody1.snapshotData;
    expect(snapshot1.experiences).toHaveLength(1);
    expect(snapshot1.experiences[0].bullets).toHaveLength(1);

    // 2. Tailor a bullet (whole-payload autosave).
    const tailoredSnapshot: CVSnapshotData = {
      ...snapshot1,
      experiences: [
        {
          ...snapshot1.experiences[0],
          bullets: [
            {
              ...snapshot1.experiences[0].bullets[0],
              text: "Shipped features tailored to this job",
            },
          ],
        },
      ],
    };
    const putRes = await putSnapshotHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/snapshot`, {
        method: "PUT",
        body: JSON.stringify(tailoredSnapshot),
      }),
      { params: Promise.resolve({ cvId }) },
    );
    expect(putRes.status).toBe(200);

    // 3. Print PDF (repeatable, no status change).
    const pdfRes = await pdfHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/pdf`),
      { params: Promise.resolve({ cvId }) },
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBuffer.length).toBeGreaterThan(0);

    // 4. Calculate Match Score (on-demand).
    const matchScoreRes = await matchScoreHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/match-score`, {
        method: "POST",
      }),
      { params: Promise.resolve({ cvId }) },
    );
    expect(matchScoreRes.status).toBe(200);
    const matchScoreBody = await matchScoreRes.json();
    expect(typeof matchScoreBody.score).toBe("number");

    // 5. Aplicar Vaga (freeze + reconcile into master Profile, one-time).
    const applyRes = await applyHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/apply`, {
        method: "POST",
      }),
      { params: Promise.resolve({ cvId }) },
    );
    expect(applyRes.status).toBe(200);
    const applyBody = await applyRes.json();
    expect(applyBody.status).toBe("APPLIED");
    expect(applyBody.appliedAt).toBeTruthy();

    // 6. Reopen — confirm read-only: status APPLIED, tailored text reflected.
    const getRes2 = await getCVHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}`),
      { params: Promise.resolve({ cvId }) },
    );
    expect(getRes2.status).toBe(200);
    const cvBody2 = await getRes2.json();
    expect(cvBody2.status).toBe("APPLIED");
    expect(cvBody2.snapshotData.experiences[0].bullets[0].text).toBe(
      "Shipped features tailored to this job",
    );

    // A subsequent snapshot PUT is rejected (409) — APPLIED CVs are read-only.
    const putAfterApplyRes = await putSnapshotHandler(
      new Request(`http://localhost:3000/api/cv/${cvId}/snapshot`, {
        method: "PUT",
        body: JSON.stringify(tailoredSnapshot),
      }),
      { params: Promise.resolve({ cvId }) },
    );
    expect(putAfterApplyRes.status).toBe(409);
  });
});
