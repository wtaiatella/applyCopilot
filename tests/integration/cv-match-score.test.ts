/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as matchScoreHandler } from "@/app/api/cv/[cvId]/match-score/route";
import { PUT as snapshotPutHandler } from "@/app/api/cv/[cvId]/snapshot/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Avoid loading the real TensorFlow USE model in tests (mirrors profile-sync.test.ts's pattern).
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.123)),
}));

import { generateEmbedding } from "@/lib/ai/vector-service";

function emptySnapshot(): CVSnapshotData {
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
        ],
      },
    ],
    education: [],
    projects: [],
    skills: [],
  };
}

describe("POST /api/cv/[cvId]/match-score — on-demand only (AC.8)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-match-score-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let cvId: string;
  let jobListingId: string;

  beforeAll(async () => {
    await prisma
      .$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;")
      .catch(() => {});

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
        externalJobId: `test-job-match-score-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
        classificationStatus: "COMPLETED",
      },
    });
    jobListingId = jobListing.id;

    const vector = new Array(768).fill(0.123);
    await prisma.$executeRawUnsafe(
      `UPDATE "JobListing" SET embedding = $1::vector WHERE id = $2`,
      `[${vector.join(",")}]`,
      jobListingId,
    );

    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId,
        name: "Match Score Test CV",
        status: "DRAFT",
        snapshotData: emptySnapshot() as unknown as object,
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

  it("returns a numeric match score on demand", async () => {
    const req = new Request(
      `http://localhost:3000/api/cv/${cvId}/match-score`,
      {
        method: "POST",
      },
    );
    const res = await matchScoreHandler(req, {
      params: Promise.resolve({ cvId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.score).toBe("number");
    expect(data.score).toBeCloseTo(100, 0); // identical embedding vs. job -> ~100% match
    expect(data.computedAt).toBeDefined();
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("never auto-recomputes the match score when the snapshot is subsequently edited", async () => {
    (generateEmbedding as jest.Mock).mockClear();

    const req = new Request(`http://localhost:3000/api/cv/${cvId}/snapshot`, {
      method: "PUT",
      body: JSON.stringify(emptySnapshot()),
    });
    const res = await snapshotPutHandler(req, {
      params: Promise.resolve({ cvId }),
    });
    expect(res.status).toBe(200);

    // The snapshot PUT (autosave) path must never itself trigger embedding generation —
    // match-score computation is strictly on-demand (button click only), per FR-13/AC.8.
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request(
      `http://localhost:3000/api/cv/${cvId}/match-score`,
      {
        method: "POST",
      },
    );
    const res = await matchScoreHandler(req, {
      params: Promise.resolve({ cvId }),
    });
    expect(res.status).toBe(401);
  });

  // REM-7 / T027: cv_match_score's own Decision 6 threshold (100/day) — completes the
  // 9-route table this ticket's rate-limit coverage spans (see profile-ai.test.ts and
  // cv-ai.test.ts for the other 8 routes).
  describe("AI rate limiting (REM-7, Decision 6 threshold)", () => {
    beforeEach(async () => {
      // Earlier tests in this file already exercise this route and leave their own
      // AIUsageLog rows behind — start each case from a clean slate.
      await prisma.aIUsageLog.deleteMany({ where: { userId: testUserId } });
    });

    afterEach(async () => {
      await prisma.aIUsageLog.deleteMany({ where: { userId: testUserId } });
    });

    it("rejects the 101st call to cv_match_score with 429 once the 100/day threshold is reached", async () => {
      await prisma.aIUsageLog.createMany({
        data: Array.from({ length: 100 }).map(() => ({
          userId: testUserId,
          action: "cv_match_score",
        })),
      });

      const req = new Request(
        `http://localhost:3000/api/cv/${cvId}/match-score`,
        { method: "POST" },
      );
      const res = await matchScoreHandler(req, {
        params: Promise.resolve({ cvId }),
      });
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toBe(
        "Rate limit reached. You can only cv_match_score 100 times per day.",
      );
      expect(generateEmbedding).not.toHaveBeenCalled();

      const logs = await prisma.aIUsageLog.count({
        where: { userId: testUserId, action: "cv_match_score" },
      });
      expect(logs).toBe(100);
    });
  });
});
