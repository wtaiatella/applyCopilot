/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as syncProfileHandler } from "@/app/api/profile/sync/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

// Mock the AI client used by profileSyncService.extractProfileFacts (generateJSON, capability "profile")
jest.mock("@/lib/ai/aiClient", () => ({
  ...jest.requireActual("@/lib/ai/aiClient"),
  generateJSON: jest.fn(),
}));

// Mock the vector service to avoid loading a real embedding provider in integration tests.
// Per spectech.md Testing Strategy: generateEmbedding's public signature is unchanged (FR-18),
// so it is mocked at the module boundary rather than expecting a live 768d vector here.
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

// Mock the auth middleware
jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

import { generateJSON } from "@/lib/ai/aiClient";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { safeCleanup } from "./helpers/test-fixtures";

const mockGenerateJSON = generateJSON as jest.Mock;
const mockGenerateEmbedding = generateEmbedding as jest.Mock;

// A valid ProfileFacts fixture matching ProfileFactsSchema
function makeValidProfileFacts(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    // Deliberately namespaced (`-TestFixture`), never bare real-world skill names: this
    // canonicalization write path persists into the shared, production-facing `SkillEmbedding`
    // table (keyed globally by lowercased skill string, no test/prod separation) via the mocked
    // `generateEmbedding` below — a bare "React"/"Node.js"/"Communication" row seeded with that
    // fake vector would collide with (and silently corrupt) the real embedding for that skill
    // system-wide. This happened for real during 015's development before this fix.
    skills: ["React-TestFixture", "Node.js-TestFixture"],
    softSkills: ["Communication-TestFixture"],
    seniority: "senior",
    totalYearsExperience: 5,
    domains: ["fintech"],
    ...overrides,
  };
}

describe("UserProfile AI Synchronization Endpoint Integration Tests", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `sync-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    // Create test user and profile in database
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Jane",
            lastName: "Doe",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;

    // Seed test experience and skills so we have content to extract facts from
    await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Vercel",
        position: "Frontend Dev",
        startDate: new Date("2022-01-01"),
        current: true,
      },
    });

    await prisma.skill.create({
      data: {
        profileId: testProfileId,
        name: "React-TestFixture",
        proficiency: "ADVANCED",
      },
    });
  });

  afterAll(async () => {
    // Clean up database records
    if (testUserId) {
      await safeCleanup("profile-sync.test.ts afterAll", async () => {
        await prisma.user.delete({
          where: { id: testUserId },
        });
      });
    }

    // Clean up the -TestFixture SkillEmbedding rows this suite's real canonicalization
    // pass writes into the shared, global SkillEmbedding table (see makeValidProfileFacts's
    // comment) — never rethrows, so this is a straightforward .catch() -> safeCleanup swap
    // rather than requiring any collision logic.
    await safeCleanup(
      "profile-sync.test.ts afterAll skillEmbedding",
      async () => {
        await prisma.skillEmbedding.deleteMany({
          where: {
            skill: {
              in: [
                "react-testfixture",
                "node.js-testfixture",
                "communication-testfixture",
              ],
            },
          },
        });
      },
    );

    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default authenticated mock session
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
    // Default: extraction returns a valid ProfileFacts payload
    mockGenerateJSON.mockResolvedValue(makeValidProfileFacts());
    // Default: embedding generation returns a 1024-dimension vector
    mockGenerateEmbedding.mockResolvedValue(new Array(1024).fill(0.123));
  });

  function makeRequest(): Request {
    return new Request("http://localhost:3000/api/profile/sync", {
      method: "POST",
    });
  }

  it("should extract ProfileFacts via LLM, generate a 1024d embedding, and update UserProfile", async () => {
    const res = await syncProfileHandler(makeRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.profileFacts).toEqual(makeValidProfileFacts());

    // Fetch the profile directly from database to verify values
    const updatedProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });

    expect(updatedProfile?.profileFacts).toEqual(makeValidProfileFacts());
    expect(updatedProfile?.embeddingSyncedAt).not.toBeNull();

    // Verify the embedding vector was generated from the skills list (not the full text)
    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      "React-TestFixture Node.js-TestFixture",
    );

    // Verify embedding vector exists in DB by querying directly (since Prisma unsupported fails to return it via findUnique)
    const rawResult = await prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;
    const dbVectorStr = rawResult[0]?.embedding;
    expect(dbVectorStr).toBeDefined();

    // Check that it is a 1024-dimension vector array format e.g. "[0.123,0.123,...]"
    const parsedVector = JSON.parse(dbVectorStr);
    expect(parsedVector).toBeInstanceOf(Array);
    expect(parsedVector.length).toBe(1024);
    expect(parsedVector[0]).toBeCloseTo(0.123);
  });

  it("should reject unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await syncProfileHandler(makeRequest());
    expect(res.status).toBe(401);
  });

  it("should return 400 if user has no experiences, education or skills", async () => {
    // Create another user without profile content
    const emptyUser = await prisma.user.create({
      data: {
        email: `empty-${Date.now()}@example.com`,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "Empty",
            lastName: "Profile",
          },
        },
      },
    });

    mockAuth.mockResolvedValue({
      user: { id: emptyUser.id, email: emptyUser.email, role: "USER" },
      expires: "any",
    });

    const res = await syncProfileHandler(makeRequest());
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain(
      "Please fill in at least one skill or experience",
    );

    // Cleanup
    await safeCleanup("profile-sync.test.ts emptyUser cleanup", async () => {
      await prisma.user.delete({ where: { id: emptyUser.id } });
    });
  });

  // ──────────────────────────────────────────────────
  // FR-22: schema-invalid ProfileFacts -> 400, no DB write, prior data preserved
  // ──────────────────────────────────────────────────

  it("returns 400 and preserves prior profileFacts/embedding when the LLM extraction fails ProfileFactsSchema validation", async () => {
    // Establish prior data via a successful sync first
    const firstRes = await syncProfileHandler(makeRequest());
    expect(firstRes.status).toBe(200);

    const priorProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });
    const priorVectorResult = await prisma.$queryRaw<
      Array<{ embedding: string }>
    >`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;
    const priorVector = priorVectorResult[0]?.embedding;
    const priorSyncedAt = priorProfile?.embeddingSyncedAt;

    // Now make the extraction return a schema-invalid shape (bad seniority enum)
    mockGenerateJSON.mockResolvedValue(
      makeValidProfileFacts({ seniority: "not-a-real-level" }),
    );
    mockGenerateEmbedding.mockClear();

    const secondRes = await syncProfileHandler(makeRequest());
    expect(secondRes.status).toBe(400);

    const data = await secondRes.json();
    expect(data.error).toContain("AI returned invalid ProfileFacts");

    // The embedding provider must never be called for an invalid-shape extraction
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();

    // Prior data must remain untouched
    const afterProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });
    const afterVectorResult = await prisma.$queryRaw<
      Array<{ embedding: string }>
    >`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;

    expect(afterProfile?.profileFacts).toEqual(priorProfile?.profileFacts);
    expect(afterProfile?.embeddingSyncedAt).toEqual(priorSyncedAt);
    expect(afterVectorResult[0]?.embedding).toEqual(priorVector);
  });

  // ──────────────────────────────────────────────────
  // FR-23: embedding provider failure -> 502, no DB write, prior data preserved
  // ──────────────────────────────────────────────────

  it("returns 502 and preserves prior profileFacts/embedding when the embedding provider fails", async () => {
    // Establish prior data via a successful sync first
    const firstRes = await syncProfileHandler(makeRequest());
    expect(firstRes.status).toBe(200);

    const priorProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });
    const priorVectorResult = await prisma.$queryRaw<
      Array<{ embedding: string }>
    >`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;
    const priorVector = priorVectorResult[0]?.embedding;
    const priorSyncedAt = priorProfile?.embeddingSyncedAt;

    // Now make the embedding provider fail transiently
    mockGenerateEmbedding.mockRejectedValue(
      new Error("Embedding provider unavailable"),
    );

    const secondRes = await syncProfileHandler(makeRequest());
    expect(secondRes.status).toBe(502);

    const data = await secondRes.json();
    expect(data.error).toContain("Embedding provider unavailable");

    // Prior data must remain untouched
    const afterProfile = await prisma.userProfile.findUnique({
      where: { userId: testUserId },
    });
    const afterVectorResult = await prisma.$queryRaw<
      Array<{ embedding: string }>
    >`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${testUserId}
    `;

    expect(afterProfile?.profileFacts).toEqual(priorProfile?.profileFacts);
    expect(afterProfile?.embeddingSyncedAt).toEqual(priorSyncedAt);
    expect(afterVectorResult[0]?.embedding).toEqual(priorVector);
  });

  // ──────────────────────────────────────────────────
  // T007/T010: write-path canonicalization wiring (FR-08) — US-1 Independent Test
  //
  // The 4-step canonicalization state machine itself (exact hit / above-threshold
  // LLM-confirm / kind isolation) is unit-tested directly against
  // `skillCanonicalizationService` in tests/unit/skillCanonicalizationService.test.ts (T009).
  // This exercises the real write path end-to-end: two sync calls with two different
  // spellings of the same (unique-to-this-test) technology must converge on one
  // `SkillEmbedding` row, with the second call recorded as a `SkillAlias` instead of a
  // second canonical row.
  // ──────────────────────────────────────────────────

  describe("canonicalization write-path (double-call dedup)", () => {
    const uniqueTech = `Zorbtech${Date.now()}`;
    const uniqueTechAltSpelling = `${uniqueTech}-Alt`;
    const normalizedTech = uniqueTech.toLowerCase();
    const normalizedAlt = uniqueTechAltSpelling.toLowerCase();

    // A one-hot pseudo-embedding isolated to a single dimension derived from this test run's
    // timestamp — cosine-orthogonal (similarity 0) to any pre-existing SkillEmbedding row (e.g.
    // "react"/"communication" seeded by earlier tests/runs, which use the shared 0.123-constant
    // default vector), but cosine-identical (similarity 100) between the two spellings under
    // test here — deterministically driving the top-1-above-threshold alias-confirm branch for
    // the alternate spelling only, without disturbing any other test's exact-hit/new-canonical
    // assertions.
    const isolatedDim = Number(uniqueTech.replace(/\D/g, "")) % 1024;
    function pseudoVector(dim: number): number[] {
      const v = new Array(1024).fill(0);
      v[dim] = 1;
      return v;
    }

    afterEach(async () => {
      // Clean up the vocabulary rows this describe block creates so repeated test runs
      // don't accumulate unbounded `SkillEmbedding`/`SkillAlias` rows.
      await safeCleanup("profile-sync.test.ts skillAlias cleanup", async () => {
        await prisma.skillAlias.deleteMany({
          where: { alias: normalizedAlt },
        });
      });
      await safeCleanup(
        "profile-sync.test.ts skillEmbedding cleanup",
        async () => {
          await prisma.skillEmbedding.deleteMany({
            where: { skill: normalizedTech },
          });
        },
      );
    });

    it('calling sync with "Postgres" then "PostgreSQL"-style alternate spellings dedups to one SkillEmbedding + one SkillAlias', async () => {
      mockGenerateEmbedding.mockImplementation((text: string) => {
        if (text === normalizedTech || text === normalizedAlt) {
          return Promise.resolve(pseudoVector(isolatedDim));
        }
        return Promise.resolve(new Array(1024).fill(0.123));
      });

      mockGenerateJSON.mockImplementation(
        (
          _prompt: string,
          capability: string,
        ): Promise<Record<string, unknown>> => {
          if (capability === "skillAlias" || capability === "profile.skillAlias") {
            return Promise.resolve({ sameTechnology: true });
          }
          return Promise.resolve(makeValidProfileFacts());
        },
      );

      // First call: genuinely new skill -> new canonical SkillEmbedding row.
      mockGenerateJSON.mockImplementationOnce(() =>
        Promise.resolve(makeValidProfileFacts({ skills: [uniqueTech] })),
      );
      const firstRes = await syncProfileHandler(makeRequest());
      expect(firstRes.status).toBe(200);

      const afterFirst = await prisma.skillEmbedding.findUnique({
        where: { skill: normalizedTech },
      });
      expect(afterFirst).not.toBeNull();
      expect(afterFirst?.displayName).toBe(uniqueTech);

      // Second call: differently-spelled alternate of the same technology -> should resolve
      // via alias-confirmation, writing a SkillAlias (not a second SkillEmbedding row).
      mockGenerateJSON.mockImplementationOnce(() =>
        Promise.resolve(
          makeValidProfileFacts({ skills: [uniqueTechAltSpelling] }),
        ),
      );
      const secondRes = await syncProfileHandler(makeRequest());
      expect(secondRes.status).toBe(200);

      const secondData = await secondRes.json();
      // The persisted/returned skill was rewritten to the first call's canonical displayName.
      expect(secondData.profileFacts.skills).toContain(uniqueTech);

      const alias = await prisma.skillAlias.findUnique({
        where: { alias: normalizedAlt },
      });
      expect(alias).not.toBeNull();
      expect(alias?.skill).toBe(normalizedTech);

      // No second SkillEmbedding row was created for the alternate spelling.
      const embeddingForAlt = await prisma.skillEmbedding.findUnique({
        where: { skill: normalizedAlt },
      });
      expect(embeddingForAlt).toBeNull();

      const embeddingCountForTech = await prisma.skillEmbedding.count({
        where: { skill: normalizedTech },
      });
      expect(embeddingCountForTech).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────
  // APC-51: Explicit active user skills union (AC-2) & softSkills narrative stabilization (AC-3)
  // ──────────────────────────────────────────────────

  describe("APC-51 — explicit user skills preservation & softSkills stabilization", () => {
    const apc51Email = `apc51-sync-${Date.now()}@example.com`;
    let apc51UserId: string;
    let apc51ProfileId: string;

    const fixtureSkillsToClean = [
      "claudecode-testfixture",
      "cursor-testfixture",
      "inactivetool-testfixture",
      "playwright-testfixture",
      "problemsolving-testfixture",
      "crossfunctionalcollab-testfixture",
      "teamwork-testfixture",
      "executivepresence-testfixture",
    ];

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: apc51Email,
          password: "hashedpassword123",
          profile: {
            create: {
              firstName: "Alex",
              lastName: "Rivera",
              title: "Staff Software Engineer",
              summary: "Builds distributed systems and AI developer tooling.",
            },
          },
        },
        include: { profile: true },
      });

      apc51UserId = user.id;
      apc51ProfileId = user.profile!.id;

      await prisma.experience.create({
        data: {
          profileId: apc51ProfileId,
          company: "Acme Cloud",
          position: "Staff Engineer",
          startDate: new Date("2021-06-01"),
          current: true,
        },
      });

      await prisma.skill.createMany({
        data: [
          {
            profileId: apc51ProfileId,
            name: "ClaudeCode-TestFixture",
            proficiency: "EXPERT",
            isActive: true,
            isArchived: false,
          },
          {
            profileId: apc51ProfileId,
            name: "Cursor-TestFixture",
            proficiency: "ADVANCED",
            isActive: true,
            isArchived: false,
          },
          {
            profileId: apc51ProfileId,
            name: "InactiveTool-TestFixture",
            proficiency: "BEGINNER",
            isActive: false,
            isArchived: false,
          },
        ],
      });
    });

    afterAll(async () => {
      if (apc51UserId) {
        await safeCleanup("profile-sync.test.ts apc51 user cleanup", async () => {
          await prisma.user.delete({ where: { id: apc51UserId } });
        });
      }
      await safeCleanup(
        "profile-sync.test.ts apc51 skillAlias cleanup",
        async () => {
          await prisma.skillAlias.deleteMany({
            where: {
              OR: [
                { alias: { in: fixtureSkillsToClean } },
                { skill: { in: fixtureSkillsToClean } },
              ],
            },
          });
        },
      );
      await safeCleanup(
        "profile-sync.test.ts apc51 skillEmbedding cleanup",
        async () => {
          await prisma.skillEmbedding.deleteMany({
            where: { skill: { in: fixtureSkillsToClean } },
          });
        },
      );
    });

    it("AC-2 & AC-3: retains explicit active skills omitted by LLM, stabilizes softSkills across skill-only edits, and updates softSkills when narrative changes", async () => {
      mockAuth.mockResolvedValue({
        user: { id: apc51UserId, email: apc51Email, role: "USER" },
        expires: "any",
      });

      // Step 1 (Initial Sync): LLM omits ClaudeCode-TestFixture & Cursor-TestFixture from skills,
      // and extracts initial softSkills.
      mockGenerateJSON.mockImplementation(
        (_prompt: string, capability: string) => {
          if (capability === "skillAlias" || capability === "profile.skillAlias") {
            return Promise.resolve({ sameTechnology: false });
          }
          return Promise.resolve(
            makeValidProfileFacts({
              skills: ["React-TestFixture", "Node.js-TestFixture"],
              softSkills: [
                "ProblemSolving-TestFixture",
                "CrossFunctionalCollab-TestFixture",
              ],
            }),
          );
        },
      );

      const sync1 = await syncProfileHandler(makeRequest());
      expect(sync1.status).toBe(200);
      const data1 = await sync1.json();

      // Explicit active skills must be retained & prioritized ahead of LLM-extracted skills;
      // inactive skill must be excluded.
      expect(data1.profileFacts.skills).toEqual([
        "ClaudeCode-TestFixture",
        "Cursor-TestFixture",
        "React-TestFixture",
        "Node.js-TestFixture",
      ]);
      expect(data1.profileFacts.skills).not.toContain(
        "InactiveTool-TestFixture",
      );
      expect(data1.profileFacts.softSkills).toEqual([
        "ProblemSolving-TestFixture",
        "CrossFunctionalCollab-TestFixture",
      ]);

      const dbAfter1 = await prisma.userProfile.findUnique({
        where: { id: apc51ProfileId },
      });
      expect(dbAfter1?.aiCleanedText).toContain("Staff Software Engineer");
      expect(dbAfter1?.aiCleanedText).not.toContain("ClaudeCode-TestFixture");

      // Step 2 (Skill-only edit — narrative unchanged): add Playwright-TestFixture while LLM
      // attempts to drift softSkills to "Teamwork-TestFixture".
      await prisma.skill.create({
        data: {
          profileId: apc51ProfileId,
          name: "Playwright-TestFixture",
          proficiency: "ADVANCED",
          isActive: true,
          isArchived: false,
        },
      });

      mockGenerateJSON.mockImplementation(
        (_prompt: string, capability: string) => {
          if (capability === "skillAlias" || capability === "profile.skillAlias") {
            return Promise.resolve({ sameTechnology: false });
          }
          return Promise.resolve(
            makeValidProfileFacts({
              skills: ["React-TestFixture"],
              softSkills: ["Teamwork-TestFixture"],
            }),
          );
        },
      );

      const sync2 = await syncProfileHandler(makeRequest());
      expect(sync2.status).toBe(200);
      const data2 = await sync2.json();

      expect(data2.profileFacts.skills).toContain("Playwright-TestFixture");
      expect(data2.profileFacts.skills).toContain("ClaudeCode-TestFixture");
      expect(data2.profileFacts.skills).toContain("Cursor-TestFixture");
      // Narrative did NOT change -> prior validated softSkills MUST be preserved!
      expect(data2.profileFacts.softSkills).toEqual([
        "ProblemSolving-TestFixture",
        "CrossFunctionalCollab-TestFixture",
      ]);

      // Step 3 (Narrative edit — summary updated): softSkills SHOULD now refresh from LLM.
      await prisma.userProfile.update({
        where: { id: apc51ProfileId },
        data: {
          summary:
            "Executive engineering leader driving cross-org platform architecture.",
        },
      });

      mockGenerateJSON.mockImplementation(
        (_prompt: string, capability: string) => {
          if (capability === "skillAlias" || capability === "profile.skillAlias") {
            return Promise.resolve({ sameTechnology: false });
          }
          return Promise.resolve(
            makeValidProfileFacts({
              skills: ["React-TestFixture"],
              softSkills: [
                "Teamwork-TestFixture",
                "ExecutivePresence-TestFixture",
              ],
            }),
          );
        },
      );

      const sync3 = await syncProfileHandler(makeRequest());
      expect(sync3.status).toBe(200);
      const data3 = await sync3.json();

      expect(data3.profileFacts.softSkills).toEqual([
        "Teamwork-TestFixture",
        "ExecutivePresence-TestFixture",
      ]);

      const dbAfter3 = await prisma.userProfile.findUnique({
        where: { id: apc51ProfileId },
      });
      expect(dbAfter3?.aiCleanedText).toContain(
        "Executive engineering leader driving cross-org platform architecture.",
      );
    });
  });
});
