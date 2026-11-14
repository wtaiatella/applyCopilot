/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as postBackfillHandler } from "@/app/api/admin/backfill-skill-vocabulary/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import {
  EMBEDDING_DIMENSION,
  generateEmbedding,
} from "@/lib/ai/vector-service";
import { generateJSON, generateText } from "@/lib/ai/aiClient";
import {
  BackfillInProgressError,
  runEmbeddingBackfill,
} from "@/services/embeddingBackfillService";
import { makeTestEmail, safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/ai/vector-service", () => {
  const actual = jest.requireActual("@/lib/ai/vector-service");
  return {
    ...actual,
    generateEmbedding: jest.fn(),
  };
});

jest.mock("@/lib/ai/aiClient", () => {
  const actual = jest.requireActual("@/lib/ai/aiClient");
  return {
    ...actual,
    generateText: jest.fn(),
    generateJSON: jest.fn(),
  };
});

function make1024Vector(seed = 0.05): number[] {
  return Array.from({ length: EMBEDDING_DIMENSION }, (_, i) =>
    Number((((i % 10) + 1) * seed * 0.1).toFixed(6)),
  );
}

describe("Backfill Skill Vocabulary Integration Tests (T015, APC-45)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateEmbedding = generateEmbedding as unknown as jest.Mock;
  const mockGenerateText = generateText as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as unknown as jest.Mock;

  const adminSession = {
    user: {
      id: "admin-user-id",
      email: "admin@example.com",
      role: "ADMIN",
    },
    expires: "any",
  };

  const createdUserIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdSkillKeys: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue(make1024Vector());
  });

  afterAll(async () => {
    await safeCleanup("backfill-skill-vocabulary.test.ts cleanup", async () => {
      if (createdJobIds.length > 0) {
        await prisma.jobListing.deleteMany({
          where: { id: { in: createdJobIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
      if (createdSkillKeys.length > 0) {
        await prisma.skillEmbedding.deleteMany({
          where: { skill: { in: createdSkillKeys } },
        });
      }
      await prisma.$disconnect();
      await pool.end();
    });
  });

  it("should return 401 if unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await postBackfillHandler();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 if user is not ADMIN", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "test-user-id",
        email: makeTestEmail("non-admin"),
        role: "USER",
      },
      expires: "any",
    });

    const res = await postBackfillHandler();
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("clears SkillEmbedding/SkillAlias, nulls UserProfile vectors, reindexes COMPLETED jobs from jobFacts.mustHave without LLM calls, and preserves non-vector data", async () => {
    mockAuth.mockResolvedValue(adminSession);

    const expectedProfileFacts = {
      skills: ["TypeScript", "PostgreSQL"],
      seniority: "senior",
    };
    const expectedJobFacts = {
      mustHave: ["TypeScript", "PostgreSQL"],
      niceToHave: ["Docker"],
    };

    const user = await prisma.user.create({
      data: {
        email: makeTestEmail("backfill-user"),
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Backfill",
            profileFacts: expectedProfileFacts,
            embeddingSyncedAt: new Date(),
            preferences: {
              create: {
                seniority: "senior",
                salaryMin: 130000,
              },
            },
          },
        },
      },
      include: { profile: { include: { preferences: true } } },
    });
    createdUserIds.push(user.id);
    const profileId = user.profile!.id;

    // Seed a 1024d vector on UserProfile so we verify embedding is nulled too.
    const vecStr = `[${make1024Vector(0.02).join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "UserProfile"
      SET "embedding" = ${vecStr}::vector
      WHERE "id" = ${profileId}
    `;

    // Eligible COMPLETED JobListing with jobFacts.mustHave
    const completedJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-completed-${Date.now()}-${Math.random()}`,
        title: "Completed Job",
        company: "Test Co",
        url: "https://example.com/completed-job",
        classificationStatus: "COMPLETED",
        classificationAttempts: 1,
        jobFacts: expectedJobFacts,
      },
    });
    createdJobIds.push(completedJob.id);

    // COMPLETED JobListing without valid jobFacts.mustHave (should be skipped)
    const skippedJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-skipped-${Date.now()}-${Math.random()}`,
        title: "Skipped Job",
        company: "Test Co",
        url: "https://example.com/skipped-job",
        classificationStatus: "COMPLETED",
        jobFacts: { niceToHave: ["GraphQL"] },
      },
    });
    createdJobIds.push(skippedJob.id);

    // PENDING JobListing (should remain untouched)
    const pendingJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-pending-${Date.now()}-${Math.random()}`,
        title: "Pending Job",
        company: "Test Co",
        url: "https://example.com/pending-job",
        classificationStatus: "PENDING",
      },
    });
    createdJobIds.push(pendingJob.id);

    // CV + Application linked to completedJob (must be preserved)
    const cv = await prisma.cV.create({
      data: {
        profileId,
        jobListingId: completedJob.id,
        name: "Backfill CV",
        snapshotData: { summary: "Preserved" },
      },
    });
    const application = await prisma.application.create({
      data: {
        cvId: cv.id,
        profileId,
        jobListingId: completedJob.id,
        stage: "APPLIED",
      },
    });

    // Seed SkillEmbedding + SkillAlias (cascade delete target)
    const skillKey = `ts-backfill-${Date.now()}`.slice(0, 100);
    const aliasKey = `ts-alias-${Date.now()}`.slice(0, 100);
    createdSkillKeys.push(skillKey);
    await prisma.$executeRaw`
      INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
      VALUES (${skillKey}, 'TypeScript', 'HARD'::"SkillKind", ${vecStr}::vector)
    `;
    await prisma.skillAlias.create({
      data: {
        alias: aliasKey,
        skill: skillKey,
      },
    });

    const res = await postBackfillHandler();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.profilesReset).toBeGreaterThanOrEqual(1);
    expect(data.skillsCleared).toBeGreaterThanOrEqual(1);
    expect(data.jobsReindexed).toBeGreaterThanOrEqual(1);
    expect(data.jobsSkipped).toBeGreaterThanOrEqual(1);

    // Zero LLM calls during embedding-only backfill
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockGenerateJSON).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("TypeScript PostgreSQL");

    // SkillEmbedding & SkillAlias cleared via cascade
    const remainingSkill = await prisma.skillEmbedding.findUnique({
      where: { skill: skillKey },
    });
    const remainingAlias = await prisma.skillAlias.findUnique({
      where: { alias: aliasKey },
    });
    expect(remainingSkill).toBeNull();
    expect(remainingAlias).toBeNull();

    // UserProfile embedding & embeddingSyncedAt nulled; profileFacts preserved
    const profileAfter = await prisma.$queryRaw<
      Array<{
        has_embedding: boolean;
        embeddingSyncedAt: Date | null;
        profileFacts: unknown;
      }>
    >`
      SELECT "embedding" IS NOT NULL AS has_embedding, "embeddingSyncedAt", "profileFacts"
      FROM "UserProfile"
      WHERE "id" = ${profileId}
    `;
    expect(profileAfter[0].has_embedding).toBe(false);
    expect(profileAfter[0].embeddingSyncedAt).toBeNull();
    expect(profileAfter[0].profileFacts).toEqual(expectedProfileFacts);

    // COMPLETED job reindexed without setting PENDING; jobFacts preserved
    const completedJobAfter = await prisma.$queryRaw<
      Array<{
        has_embedding: boolean;
        classificationStatus: string;
        jobFacts: unknown;
      }>
    >`
      SELECT "embedding" IS NOT NULL AS has_embedding, "classificationStatus", "jobFacts"
      FROM "JobListing"
      WHERE "id" = ${completedJob.id}
    `;
    expect(completedJobAfter[0].has_embedding).toBe(true);
    expect(completedJobAfter[0].classificationStatus).toBe("COMPLETED");
    expect(completedJobAfter[0].jobFacts).toEqual(expectedJobFacts);

    // Skipped COMPLETED job & PENDING job keep their status
    const skippedJobAfter = await prisma.jobListing.findUnique({
      where: { id: skippedJob.id },
    });
    expect(skippedJobAfter?.classificationStatus).toBe("COMPLETED");

    const pendingJobAfter = await prisma.jobListing.findUnique({
      where: { id: pendingJob.id },
    });
    expect(pendingJobAfter?.classificationStatus).toBe("PENDING");

    // Application & UserPreferences preserved
    const appAfter = await prisma.application.findUnique({
      where: { id: application.id },
    });
    expect(appAfter?.stage).toBe("APPLIED");

    const prefsAfter = await prisma.userPreferences.findUnique({
      where: { profileId },
    });
    expect(prefsAfter?.seniority).toBe("senior");
    expect(prefsAfter?.salaryMin).toBe(130000);
  });

  it("enforces single-execution lock: throws BackfillInProgressError in service and returns 409 on concurrent POST", async () => {
    mockAuth.mockResolvedValue(adminSession);

    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `backfill-lock-${Date.now()}-${Math.random()}`,
        title: "Lock Test Job",
        company: "Test Co",
        url: "https://example.com/lock-job",
        classificationStatus: "COMPLETED",
        jobFacts: { mustHave: ["Node.js"] },
      },
    });
    createdJobIds.push(job.id);

    let releaseEmbedding!: () => void;
    const embeddingGate = new Promise<void>((resolve) => {
      releaseEmbedding = resolve;
    });

    mockGenerateEmbedding.mockImplementation(async () => {
      await embeddingGate;
      return make1024Vector();
    });

    const firstRun = postBackfillHandler();

    // Wait until the first run enters generateEmbedding (holding both mutex & advisory lock)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Concurrent service call must throw BackfillInProgressError
    await expect(runEmbeddingBackfill("admin-user-id")).rejects.toBeInstanceOf(
      BackfillInProgressError,
    );

    // Concurrent HTTP handler call must return 409 Conflict
    const concurrentRes = await postBackfillHandler();
    expect(concurrentRes.status).toBe(409);
    const concurrentData = await concurrentRes.json();
    expect(concurrentData.error).toBe(
      "A skill vocabulary and embedding backfill is already in progress.",
    );

    releaseEmbedding();
    const firstRes = await firstRun;
    expect(firstRes.status).toBe(200);
  });
});
