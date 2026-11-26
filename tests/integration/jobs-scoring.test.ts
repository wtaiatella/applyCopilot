/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getJobsHandler } from "@/app/api/jobs/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";
import { logger } from "@/lib/logging/logger";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Pass-through wrapper around the real Stage-1 query. By default it changes nothing; the APC-44
// salary-summary suite sets `stage1Restriction` so the (shared dev DB's) unrelated jobs are not
// scored, which lets it assert exact counter sums against its own fixtures.
const stage1Restriction: { ids: string[] | null } = { ids: null };
jest.mock("@/lib/db/job-query", () => {
  const actual = jest.requireActual("@/lib/db/job-query");
  return {
    ...actual,
    getJobsWithSimilarity: async (...args: unknown[]) => {
      const rows = await actual.getJobsWithSimilarity(...args);
      return stage1Restriction.ids
        ? rows.filter((r: { id: string }) =>
            stage1Restriction.ids!.includes(r.id),
          )
        : rows;
    },
  };
});

interface JobsApiResponseItem {
  id: string;
  title: string;
  matchScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  niceToHaveMatched: string[];
  niceToHaveMissing: string[];
  softSkillsMatched: string[];
  softSkillsMissing: string[];
  disqualified: boolean;
  disqualifyReason: string | null;
}

// Same profile embedding bias for every fixture job below (Stage-1 similarity always ~100%) —
// isolates every assertion to Stage 2's composite scoring/sort/filter behavior rather than
// Stage 1's raw cosine similarity (T034, FR-13/FR-14/FR-17, SC-02, Cenário 5).
function makeVector(bias: number): string {
  const vec = new Array(EMBEDDING_DIMENSION).fill(0.1);
  vec[0] = bias;
  return `[${vec.join(",")}]`;
}

// Phase 4 (US2) fixup: Stage-2's mustHave/niceToHave scoring now reads `SkillEmbedding` rows
// via max-cosine (skillVectorLookupService) instead of case-insensitive string overlap. This
// suite seeds fixtures with raw `$executeRawUnsafe` writes that never go through the
// canonicalization write path, so a not-yet-cached skill correctly-but-differently
// graceful-degrades to a 0 item score (spectech.md's documented degrade rule) instead of the
// >=skillMatchThreshold match the string-overlap era produced. Seed canonical `SkillEmbedding`
// rows here for exactly the skills this suite expects to resolve as "matched" — every fixture
// vector is a constant-fill vector, so any two of them are cosine-identical (1.0) regardless of
// the fill value. "Rust" and "Go" (Low Match Job's mustHave) are deliberately left unseeded so
// they keep degrading to 0, preserving this suite's great-vs-low composite-score ordering
// assertions.
//
// IMPORTANT — fixture skill names are deliberately namespaced (`-TestFixture` suffix), NEVER the
// bare real-world names ("React", "TypeScript", "Node.js"): this table is the shared,
// production-facing canonical skill vocabulary — a bare-name row seeded with a fake constant
// vector here would collide with (and silently corrupt) the real embedding for that skill
// system-wide, since `SkillEmbedding.skill` is a single global key with no test/prod separation.
// This happened for real during 015's own development (react/node.js/typescript rows were
// contaminated by this exact pattern before the namespacing fix) — keep the suffix.
// `ON CONFLICT DO NOTHING` makes this idempotent and safe to re-run — no per-test cleanup, since
// the namespaced rows can never be mistaken for real canonical vocabulary.
function makeSkillVector(): string {
  return `[${new Array(EMBEDDING_DIMENSION).fill(0.5).join(",")}]`;
}

async function seedSkillEmbedding(
  skill: string,
  displayName: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
     VALUES ($1, $2, 'HARD'::"SkillKind", $3::vector)
     ON CONFLICT (skill) DO NOTHING`,
    skill,
    displayName,
    makeSkillVector(),
  );
}

describe("GET /api/jobs — Stage 1 + Stage 2 composite scoring end-to-end (T034)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `jobs-scoring-${Date.now()}@example.com`;
  let userId: string;
  let profileId: string;
  const createdJobIds: string[] = [];

  const profileFacts = {
    skills: [
      "React-TestFixture",
      "TypeScript-TestFixture",
      "Node.js-TestFixture",
    ],
    softSkills: [],
    seniority: "mid",
    totalYearsExperience: 4,
    domains: [],
  };

  const baseJobFacts = {
    niceToHave: [] as string[],
    softSkills: [] as string[],
    employmentType: "permanent",
    workMode: null as string | null,
    isWorldwide: null as boolean | null,
    requiresUsWorkAuth: null as boolean | null,
    providesRelocationVisa: null as boolean | null,
    location: null as string | null,
    salaryMin: null as number | null,
    salaryMax: null as number | null,
    currency: null as string | null,
  };

  beforeAll(async () => {
    await Promise.all([
      seedSkillEmbedding("react-testfixture", "React-TestFixture"),
      seedSkillEmbedding("typescript-testfixture", "TypeScript-TestFixture"),
      seedSkillEmbedding("node.js-testfixture", "Node.js-TestFixture"),
    ]);

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Score", lastName: "Tester" } },
      },
    });
    userId = user.id;
    profileId = (
      await prisma.userProfile.findUniqueOrThrow({ where: { userId } })
    ).id;

    await prisma.$executeRawUnsafe(
      `UPDATE "UserProfile" SET embedding = $1::vector, "profileFacts" = $2::jsonb WHERE id = $3`,
      makeVector(0.9),
      JSON.stringify(profileFacts),
      profileId,
    );

    // hasUsWorkAuth: false triggers a hard disqualification against any job that explicitly
    // requires US work auth; seniority/totalYearsExperience feed computeSeniorityFit.
    await prisma.userPreferences.create({
      data: {
        profileId,
        hasUsWorkAuth: false,
        seniority: "mid",
        totalYearsExperience: 4,
      },
    });

    const jobDefs = [
      {
        title: "Great Match Job",
        jobFacts: {
          ...baseJobFacts,
          mustHave: ["React-TestFixture", "TypeScript-TestFixture"],
          seniority: "mid",
          yearsExperienceMin: 3,
        },
      },
      {
        // Best raw skill overlap of all three fixtures, but explicitly requires US work auth —
        // must still sort last (Cenário 5's hard-disqualification demotion).
        title: "Disqualified Despite Great Skills",
        jobFacts: {
          ...baseJobFacts,
          mustHave: [
            "React-TestFixture",
            "TypeScript-TestFixture",
            "Node.js-TestFixture",
          ],
          seniority: "mid",
          yearsExperienceMin: 3,
          requiresUsWorkAuth: true,
        },
      },
      {
        title: "Low Match Job",
        jobFacts: {
          ...baseJobFacts,
          mustHave: ["Rust", "Go"],
          seniority: "principal",
          yearsExperienceMin: 12,
        },
      },
    ];

    for (const jobDef of jobDefs) {
      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `jobs-scoring-${Date.now()}-${Math.random()}`,
          title: jobDef.title,
          company: "Test Co",
          url: `https://example.com/${encodeURIComponent(jobDef.title)}`,
          isFullDescriptionFetched: true,
          classificationStatus: "COMPLETED",
          postedAt: new Date(),
        },
      });
      createdJobIds.push(job.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "JobListing" SET embedding = $1::vector, "jobFacts" = $2::jsonb WHERE id = $3`,
        makeVector(0.9),
        JSON.stringify(jobDef.jobFacts),
        job.id,
      );
    }
  });

  afterAll(async () => {
    await safeCleanup(
      "jobs-scoring.test.ts afterAll userPreferences",
      async () => {
        await prisma.userPreferences.deleteMany({ where: { profileId } });
      },
    );
    await safeCleanup("jobs-scoring.test.ts afterAll jobListing", async () => {
      await prisma.jobListing.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    });
    await safeCleanup("jobs-scoring.test.ts afterAll user", async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    await safeCleanup(
      "jobs-scoring.test.ts afterAll skillEmbedding",
      async () => {
        await prisma.skillEmbedding.deleteMany({
          where: {
            skill: {
              in: [
                "react-testfixture",
                "typescript-testfixture",
                "node.js-testfixture",
              ],
            },
          },
        });
      },
    );
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: { id: userId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  function onlyOurJobs(jobs: JobsApiResponseItem[]): JobsApiResponseItem[] {
    return jobs.filter((j) => createdJobIds.includes(j.id));
  }

  async function fetchJobs(query = ""): Promise<JobsApiResponseItem[]> {
    const res = await getJobsHandler(
      new Request(`http://localhost:3000/api/jobs?days=3650&limit=100${query}`),
    );
    expect(res.status).toBe(200);
    return onlyOurJobs(await res.json());
  }

  it("computes a Stage-2 composite matchScore per candidate with matched/missing skill breakdowns (FR-13, FR-14)", async () => {
    const jobs = await fetchJobs();
    expect(jobs).toHaveLength(3);

    const great = jobs.find((j) => j.title === "Great Match Job")!;
    expect(great.matchScore).not.toBeNull();
    expect([...great.matchedSkills].sort()).toEqual([
      "React-TestFixture",
      "TypeScript-TestFixture",
    ]);
    expect(great.missingSkills).toEqual([]);
    expect(great.disqualified).toBe(false);
  });

  it("demotes a disqualified job to the end of the sort regardless of its raw skill match (Cenário 5)", async () => {
    const jobs = await fetchJobs();

    const disqualifiedIndex = jobs.findIndex(
      (j) => j.title === "Disqualified Despite Great Skills",
    );
    const greatIndex = jobs.findIndex((j) => j.title === "Great Match Job");
    const lowIndex = jobs.findIndex((j) => j.title === "Low Match Job");

    // Despite matching all 3 mustHave skills (the best raw overlap of the three fixtures), the
    // disqualified job sorts strictly after both non-disqualified jobs.
    expect(disqualifiedIndex).toBeGreaterThan(greatIndex);
    expect(disqualifiedIndex).toBeGreaterThan(lowIndex);

    const disqualifiedJob = jobs[disqualifiedIndex];
    expect(disqualifiedJob.disqualified).toBe(true);
    expect(disqualifiedJob.matchScore).toBe(0);
    expect(disqualifiedJob.matchedSkills).toEqual([]);
    expect(disqualifiedJob.disqualifyReason).toMatch(/US work authorization/);
  });

  it("ranks a better composite match above a worse one when neither is disqualified", async () => {
    const jobs = await fetchJobs();
    const great = jobs.find((j) => j.title === "Great Match Job")!;
    const low = jobs.find((j) => j.title === "Low Match Job")!;

    expect(great.matchScore).toBeGreaterThan(low.matchScore!);
    expect(jobs.indexOf(great)).toBeLessThan(jobs.indexOf(low));
  });

  it("filters by minMatch on the FINAL composite score (post Stage-2), not Stage-1 similarity (SC-02)", async () => {
    // All fixture jobs share the same Stage-1 similarity (identical embedding bias) — filtering
    // by a mid-range minMatch is therefore driven entirely by Stage 2's composite score, proving
    // the filter runs after Stage 2 completes rather than on the raw `mustHaveSimilarity`.
    const allJobs = await fetchJobs();
    const great = allJobs.find((j) => j.title === "Great Match Job")!;
    const low = allJobs.find((j) => j.title === "Low Match Job")!;
    expect(great.matchScore).toBeGreaterThan(low.matchScore!);

    const threshold = Math.round((great.matchScore! + low.matchScore!) / 2);
    const filteredJobs = await fetchJobs(`&minMatch=${threshold}`);

    expect(filteredJobs.some((j) => j.title === "Great Match Job")).toBe(true);
    expect(filteredJobs.some((j) => j.title === "Low Match Job")).toBe(false);
    // The disqualified job's matchScore is 0 — always excluded by any positive threshold too.
    expect(
      filteredJobs.some((j) => j.title === "Disqualified Despite Great Skills"),
    ).toBe(false);
  });

  it("returns matchScore=null for every job when the profile has no embedding (FR-17)", async () => {
    const otherEmail = `jobs-scoring-noembed-${Date.now()}@example.com`;
    const otherUser = await prisma.user.create({
      data: {
        email: otherEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "No", lastName: "Embed" } },
      },
    });
    try {
      mockAuth.mockResolvedValue({
        user: { id: otherUser.id, email: otherEmail, role: "USER" },
        expires: "any",
      });
      const jobs = await fetchJobs();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every((j) => j.matchScore === null)).toBe(true);
      expect(jobs.every((j) => j.disqualified === false)).toBe(true);
    } finally {
      await safeCleanup("jobs-scoring.test.ts noembed otherUser", async () => {
        await prisma.user.delete({ where: { id: otherUser.id } });
      });
    }
  });
});

describe("GET /api/jobs — multi-period salary scoring and summary counters (APC-44, T028)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `jobs-salary-${Date.now()}@example.com`;
  let userId: string;
  let profileId: string;
  const jobIds: string[] = [];

  const profileFacts = {
    skills: ["React-TestFixture"],
    softSkills: [],
    seniority: "mid",
    totalYearsExperience: 4,
    domains: [],
  };

  const baseFacts = {
    niceToHave: [] as string[],
    softSkills: [] as string[],
    mustHave: ["React-TestFixture"],
    employmentType: "permanent",
    workMode: null,
    isWorldwide: null,
    requiresUsWorkAuth: null as boolean | null,
    providesRelocationVisa: null,
    location: null,
    seniority: "mid",
    yearsExperienceMin: 3,
    salaryMin: null as number | null,
    salaryMax: null as number | null,
    currency: null as string | null,
  };

  const jobDefs: Array<{ title: string; facts: Record<string, unknown> }> = [
    {
      title: "Hourly High",
      facts: { salaryMin: 50, currency: "USD", salaryPeriod: "HOURLY" },
    },
    {
      title: "Hourly Low",
      facts: { salaryMin: 20, currency: "USD", salaryPeriod: "HOURLY" },
    },
    {
      title: "Monthly",
      facts: { salaryMin: 9000, currency: "USD", salaryPeriod: "MONTHLY" },
    },
    // Legacy fact: NO salaryPeriod key at all -> treated as yearly (AC-6).
    { title: "Legacy 120k", facts: { salaryMin: 120000, currency: "USD" } },
    {
      title: "Explicit Yearly 120k",
      facts: { salaryMin: 120000, currency: "USD", salaryPeriod: "YEARLY" },
    },
    { title: "Legacy 30k", facts: { salaryMin: 30000, currency: "USD" } },
    {
      title: "Explicit Yearly 30k",
      facts: { salaryMin: 30000, currency: "USD", salaryPeriod: "YEARLY" },
    },
    // Unknown period (null) with a hourly-looking amount -> inferred HOURLY.
    {
      title: "Inferred Hourly",
      facts: { salaryMin: 45, currency: "USD", salaryPeriod: null },
    },
    { title: "No Amount", facts: { currency: "USD", salaryPeriod: "YEARLY" } },
    {
      title: "Currency Mismatch",
      facts: { salaryMin: 120000, currency: "EUR", salaryPeriod: "YEARLY" },
    },
    // Eliminated before salary evaluation -> must not be counted.
    {
      title: "Disqualified",
      facts: {
        salaryMin: 120000,
        currency: "USD",
        salaryPeriod: "YEARLY",
        requiresUsWorkAuth: true,
      },
    },
  ];

  async function runAndCaptureSummary(): Promise<{
    jobs: Array<JobsApiResponseItem>;
    counters: Record<string, number>;
  }> {
    const spy = jest.spyOn(logger, "debug") as unknown as jest.SpyInstance<
      unknown,
      unknown[]
    >;
    try {
      const res = await getJobsHandler(
        new Request("http://localhost:3000/api/jobs?days=3650&limit=100"),
      );
      expect(res.status).toBe(200);
      const jobs = (await res.json()) as JobsApiResponseItem[];
      const calls = spy.mock.calls.filter(
        (c) => c[0] === "Salary comparison summary",
      );
      expect(calls).toHaveLength(1);
      return {
        jobs,
        counters: calls[0][1] as unknown as Record<string, number>,
      };
    } finally {
      spy.mockRestore();
    }
  }

  const sum = (c: Record<string, number>) =>
    Object.values(c).reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    await seedSkillEmbedding("react-testfixture", "React-TestFixture");
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Salary", lastName: "Tester" } },
      },
    });
    userId = user.id;
    profileId = (
      await prisma.userProfile.findUniqueOrThrow({ where: { userId } })
    ).id;
    await prisma.$executeRawUnsafe(
      `UPDATE "UserProfile" SET embedding = $1::vector, "profileFacts" = $2::jsonb WHERE id = $3`,
      makeVector(0.9),
      JSON.stringify(profileFacts),
      profileId,
    );
    await prisma.userPreferences.create({
      data: {
        profileId,
        hasUsWorkAuth: false,
        seniority: "mid",
        totalYearsExperience: 4,
        salaryMin: 100000,
        salaryCurrency: "USD",
        salaryPeriod: "YEARLY",
        hourlyMin: 40,
        hourlyCurrency: "USD",
      },
    });
    for (const def of jobDefs) {
      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `jobs-salary-${Date.now()}-${Math.random()}`,
          title: def.title,
          company: "Test Co",
          url: `https://example.com/salary/${encodeURIComponent(def.title)}`,
          isFullDescriptionFetched: true,
          classificationStatus: "COMPLETED",
          postedAt: new Date(),
        },
      });
      jobIds.push(job.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "JobListing" SET embedding = $1::vector, "jobFacts" = $2::jsonb WHERE id = $3`,
        makeVector(0.9),
        JSON.stringify({ ...baseFacts, ...def.facts }),
        job.id,
      );
    }
    stage1Restriction.ids = jobIds;
  });

  afterAll(async () => {
    stage1Restriction.ids = null;
    await safeCleanup(
      "jobs-scoring.test.ts salary userPreferences",
      async () => {
        await prisma.userPreferences.deleteMany({ where: { profileId } });
      },
    );
    await safeCleanup("jobs-scoring.test.ts salary jobListing", async () => {
      await prisma.jobListing.deleteMany({ where: { id: { in: jobIds } } });
    });
    await safeCleanup("jobs-scoring.test.ts salary user", async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    await safeCleanup(
      "jobs-scoring.test.ts salary skillEmbedding",
      async () => {
        await prisma.skillEmbedding.deleteMany({
          where: { skill: "react-testfixture" },
        });
      },
    );
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: { id: userId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  it("scores hourly, monthly and legacy-yearly jobs like-for-like and counts each evaluated job once", async () => {
    const { jobs, counters } = await runAndCaptureSummary();
    const byTitle = (t: string) => jobs.find((j) => j.title === t)!;

    expect(jobs).toHaveLength(jobDefs.length);
    // Hourly compared against the hourly preference (40/h): 50 meets it, 20 falls short.
    expect(byTitle("Hourly High").matchScore!).toBeGreaterThan(
      byTitle("Hourly Low").matchScore!,
    );
    // Monthly 9000 -> 108000/yr meets the 100000 yearly preference: same salary sub-score as
    // a yearly job that meets it.
    expect(byTitle("Monthly").matchScore).toBe(
      byTitle("Explicit Yearly 120k").matchScore,
    );
    // AC-6: a legacy fact (no salaryPeriod key) behaves exactly like an explicit YEARLY one.
    expect(byTitle("Legacy 120k").matchScore).toBe(
      byTitle("Explicit Yearly 120k").matchScore,
    );
    expect(byTitle("Legacy 30k").matchScore).toBe(
      byTitle("Explicit Yearly 30k").matchScore,
    );
    expect(byTitle("Legacy 30k").matchScore!).toBeLessThan(
      byTitle("Legacy 120k").matchScore!,
    );
    expect(byTitle("Disqualified").disqualified).toBe(true);

    expect(counters).toEqual({
      compared: 7, // Hourly High/Low, Monthly, Legacy 120k/30k, Explicit Yearly 120k/30k
      inferred: 1, // Inferred Hourly
      inferenceBlocked: 0,
      currencyMismatch: 1,
      noPreference: 0,
      noJobAmount: 1,
    });
    // Counters sum to the scored (non-disqualified) jobs; the disqualified one is not counted.
    expect(sum(counters)).toBe(jobs.filter((j) => !j.disqualified).length);
  });

  it("increments noPreference, not inferenceBlocked, when the selected preference is unset", async () => {
    await prisma.userPreferences.update({
      where: { profileId },
      data: { hourlyMin: null, hourlyCurrency: null },
    });
    const { jobs, counters } = await runAndCaptureSummary();

    // Hourly High/Low (stated) and Inferred Hourly all face the unset hourly preference.
    expect(counters.noPreference).toBe(3);
    expect(counters.inferenceBlocked).toBe(0);
    expect(counters.inferred).toBe(0);
    expect(counters.compared).toBe(5 - 0); // Monthly, Legacy x2, Explicit Yearly x2
    expect(sum(counters)).toBe(jobs.filter((j) => !j.disqualified).length);
  });
});

// Unit vector in R^EMBEDDING_DIMENSION with exact cosine `cosTheta` against e0 = [1, 0, ..., 0]:
// v(c) = [c, sqrt(1 - c^2), 0, ..., 0] has ||v|| = 1 and dot(e0, v(c)) = c.
function makeUnitVectorWithCosine(cosTheta: number): string {
  const vec = new Array(EMBEDDING_DIMENSION).fill(0);
  vec[0] = cosTheta;
  vec[1] = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return `[${vec.join(",")}]`;
}

async function seedSkillEmbeddingWithVector(
  skill: string,
  displayName: string,
  kind: "HARD" | "SOFT",
  vectorLiteral: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
     VALUES ($1, $2, $3::"SkillKind", $4::vector)
     ON CONFLICT (skill) DO UPDATE
       SET "displayName" = EXCLUDED."displayName",
           kind = EXCLUDED.kind,
           embedding = EXCLUDED.embedding`,
    skill,
    displayName,
    kind,
    vectorLiteral,
  );
}

describe("GET /api/jobs — below-threshold skill penalty, live threshold refresh & debug summary (APC-50, T006)", () => {
  const THRESHOLD_KEY = "SKILL_MATCH_DISPLAY_THRESHOLD";
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `jobs-apc50-${Date.now()}@example.com`;
  let userId: string;
  let profileId: string;
  const jobIds: string[] = [];
  let priorThresholdValue: string | null = null;

  const SKILL_KEYS = {
    profileHard: "APC50-Profile-Hard-TestFixture",
    hardHigh: "APC50-Hard-High-TestFixture", // cosine 0.90 -> 90
    hardPartial: "APC50-Hard-Partial-TestFixture", // cosine 0.72 -> 72
    profileSoft: "APC50-Profile-Soft-TestFixture",
    softHigh: "APC50-Soft-High-TestFixture", // cosine 0.90 -> 90
    softPartial: "APC50-Soft-Partial-TestFixture", // cosine 0.72 -> 72
  };

  const allSeededSkillKeys = Object.values(SKILL_KEYS).map((s) =>
    s.toLowerCase(),
  );

  const profileFacts = {
    skills: [SKILL_KEYS.profileHard],
    softSkills: [SKILL_KEYS.profileSoft],
    seniority: "mid",
    totalYearsExperience: 4,
    domains: [],
  };

  // Fixed non-skill sub-scores for every non-disqualified job:
  //   seniorityScore = 100 (mid vs mid, 4 >= 3)
  //   preferencesScore = round((100 [workAuth] + 100 [remote] + 75 [no salary]) / 3) = 92
  //   non-skill contribution = 100 * 0.15 + 92 * 0.10 = 24.2
  const baseJobFacts = {
    employmentType: "permanent",
    workMode: "remote",
    isWorldwide: null,
    requiresUsWorkAuth: false,
    providesRelocationVisa: null,
    location: null,
    seniority: "mid",
    yearsExperienceMin: 3,
    salaryMin: null,
    salaryMax: null,
    currency: null,
  };

  const jobDefs: Array<{ title: string; facts: Record<string, unknown> }> = [
    {
      // Mixed 90 & 72 across all three skill dimensions:
      //   threshold 83 -> each dim avg(90, 0) = 45 -> round(45*0.75 + 24.2) = 58
      //   threshold 70 -> each dim avg(90, 72) = 81 -> round(81*0.75 + 24.2) = 85
      title: "APC-50 Mixed Partial Skills",
      facts: {
        mustHave: [SKILL_KEYS.hardHigh, SKILL_KEYS.hardPartial],
        niceToHave: [SKILL_KEYS.hardHigh, SKILL_KEYS.hardPartial],
        softSkills: [SKILL_KEYS.softHigh, SKILL_KEYS.softPartial],
      },
    },
    {
      // All skills below threshold 83 (raw 72):
      //   threshold 83 -> each dim scores 0 (not 100) -> round(0 + 24.2) = 24
      //   threshold 70 -> each dim scores 72 -> round(72*0.75 + 24.2) = 78
      title: "APC-50 All Below Threshold",
      facts: {
        mustHave: [SKILL_KEYS.hardPartial],
        niceToHave: [SKILL_KEYS.hardPartial],
        softSkills: [SKILL_KEYS.softPartial],
      },
    },
    {
      // Empty skill dimensions retain neutral 100 under any threshold:
      //   round(100*0.75 + 24.2) = 99
      title: "APC-50 Empty Skill Dimensions",
      facts: {
        mustHave: [],
        niceToHave: [],
        softSkills: [],
      },
    },
    {
      // Disqualified job must score 0 and be excluded from Skill match scoring summary counters.
      title: "APC-50 Disqualified Job",
      facts: {
        mustHave: [SKILL_KEYS.hardPartial],
        niceToHave: [SKILL_KEYS.hardPartial],
        softSkills: [SKILL_KEYS.softPartial],
        requiresUsWorkAuth: true,
      },
    },
  ];

  async function setThreshold(value: number): Promise<void> {
    await prisma.systemConfig.upsert({
      where: { key: THRESHOLD_KEY },
      update: { value: String(value) },
      create: { key: THRESHOLD_KEY, value: String(value) },
    });
  }

  async function restoreThreshold(): Promise<void> {
    if (priorThresholdValue !== null) {
      await prisma.systemConfig.upsert({
        where: { key: THRESHOLD_KEY },
        update: { value: priorThresholdValue },
        create: { key: THRESHOLD_KEY, value: priorThresholdValue },
      });
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: THRESHOLD_KEY },
      });
    }
  }

  async function fetchJobsWithDebugSummary(): Promise<{
    jobs: JobsApiResponseItem[];
    summary: Record<string, unknown>;
  }> {
    const spy = jest.spyOn(logger, "debug") as unknown as jest.SpyInstance<
      unknown,
      unknown[]
    >;
    try {
      const res = await getJobsHandler(
        new Request("http://localhost:3000/api/jobs?days=3650&limit=100"),
      );
      expect(res.status).toBe(200);
      const jobs = (await res.json()) as JobsApiResponseItem[];
      const calls = spy.mock.calls.filter(
        (c) => c[0] === "Skill match scoring summary",
      );
      expect(calls).toHaveLength(1);
      return {
        jobs,
        summary: calls[0][1] as Record<string, unknown>,
      };
    } finally {
      spy.mockRestore();
    }
  }

  beforeAll(async () => {
    const existingConfig = await prisma.systemConfig.findUnique({
      where: { key: THRESHOLD_KEY },
    });
    priorThresholdValue = existingConfig?.value ?? null;

    await Promise.all([
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.profileHard.toLowerCase(),
        SKILL_KEYS.profileHard,
        "HARD",
        makeUnitVectorWithCosine(1.0),
      ),
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.hardHigh.toLowerCase(),
        SKILL_KEYS.hardHigh,
        "HARD",
        makeUnitVectorWithCosine(0.9),
      ),
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.hardPartial.toLowerCase(),
        SKILL_KEYS.hardPartial,
        "HARD",
        makeUnitVectorWithCosine(0.72),
      ),
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.profileSoft.toLowerCase(),
        SKILL_KEYS.profileSoft,
        "SOFT",
        makeUnitVectorWithCosine(1.0),
      ),
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.softHigh.toLowerCase(),
        SKILL_KEYS.softHigh,
        "SOFT",
        makeUnitVectorWithCosine(0.9),
      ),
      seedSkillEmbeddingWithVector(
        SKILL_KEYS.softPartial.toLowerCase(),
        SKILL_KEYS.softPartial,
        "SOFT",
        makeUnitVectorWithCosine(0.72),
      ),
    ]);

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Threshold", lastName: "Tester" } },
      },
    });
    userId = user.id;
    profileId = (
      await prisma.userProfile.findUniqueOrThrow({ where: { userId } })
    ).id;

    await prisma.$executeRawUnsafe(
      `UPDATE "UserProfile" SET embedding = $1::vector, "profileFacts" = $2::jsonb WHERE id = $3`,
      makeVector(0.9),
      JSON.stringify(profileFacts),
      profileId,
    );

    await prisma.userPreferences.create({
      data: {
        profileId,
        hasUsWorkAuth: false,
        seniority: "mid",
        totalYearsExperience: 4,
      },
    });

    for (const def of jobDefs) {
      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `jobs-apc50-${Date.now()}-${Math.random()}`,
          title: def.title,
          company: "Test Co",
          url: `https://example.com/apc50/${encodeURIComponent(def.title)}`,
          isFullDescriptionFetched: true,
          classificationStatus: "COMPLETED",
          postedAt: new Date(),
        },
      });
      jobIds.push(job.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "JobListing" SET embedding = $1::vector, "jobFacts" = $2::jsonb WHERE id = $3`,
        makeVector(0.9),
        JSON.stringify({ ...baseJobFacts, ...def.facts }),
        job.id,
      );
    }

    stage1Restriction.ids = jobIds;
  });

  afterAll(async () => {
    stage1Restriction.ids = null;
    await safeCleanup(
      "jobs-scoring.test.ts apc50 restore SystemConfig",
      async () => {
        await restoreThreshold();
      },
    );
    await safeCleanup(
      "jobs-scoring.test.ts apc50 userPreferences",
      async () => {
        await prisma.userPreferences.deleteMany({ where: { profileId } });
      },
    );
    await safeCleanup("jobs-scoring.test.ts apc50 jobListing", async () => {
      await prisma.jobListing.deleteMany({ where: { id: { in: jobIds } } });
    });
    await safeCleanup("jobs-scoring.test.ts apc50 user", async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    await safeCleanup(
      "jobs-scoring.test.ts apc50 skillEmbedding",
      async () => {
        await prisma.skillEmbedding.deleteMany({
          where: { skill: { in: allSeededSkillKeys } },
        });
      },
    );
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: { id: userId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  it("penalizes below-threshold HARD and SOFT skills as 0 while preserving empty-dimension 100 and emitting PII-free debug summary", async () => {
    try {
      await setThreshold(83);
      const { jobs, summary } = await fetchJobsWithDebugSummary();
      const byTitle = (t: string) => jobs.find((j) => j.title === t)!;

      expect(jobs).toHaveLength(jobDefs.length);

      // Mixed job: 90 is Matched, 72 is Missing and penalized as 0 -> 45 per dim -> composite 58
      const mixed = byTitle("APC-50 Mixed Partial Skills");
      expect(mixed.matchedSkills).toEqual([SKILL_KEYS.hardHigh]);
      expect(mixed.missingSkills).toEqual([SKILL_KEYS.hardPartial]);
      expect(mixed.niceToHaveMatched).toEqual([SKILL_KEYS.hardHigh]);
      expect(mixed.niceToHaveMissing).toEqual([SKILL_KEYS.hardPartial]);
      expect(mixed.softSkillsMatched).toEqual([SKILL_KEYS.softHigh]);
      expect(mixed.softSkillsMissing).toEqual([SKILL_KEYS.softPartial]);
      expect(mixed.matchScore).toBe(58);

      // All-below-threshold job: all 3 dimensions score 0 (never 100) -> composite 24
      const allBelow = byTitle("APC-50 All Below Threshold");
      expect(allBelow.matchedSkills).toEqual([]);
      expect(allBelow.missingSkills).toEqual([SKILL_KEYS.hardPartial]);
      expect(allBelow.niceToHaveMatched).toEqual([]);
      expect(allBelow.niceToHaveMissing).toEqual([SKILL_KEYS.hardPartial]);
      expect(allBelow.softSkillsMatched).toEqual([]);
      expect(allBelow.softSkillsMissing).toEqual([SKILL_KEYS.softPartial]);
      expect(allBelow.matchScore).toBe(24);

      // Empty skill dimensions retain neutral 100 -> composite 99
      const empty = byTitle("APC-50 Empty Skill Dimensions");
      expect(empty.matchedSkills).toEqual([]);
      expect(empty.missingSkills).toEqual([]);
      expect(empty.niceToHaveMatched).toEqual([]);
      expect(empty.niceToHaveMissing).toEqual([]);
      expect(empty.softSkillsMatched).toEqual([]);
      expect(empty.softSkillsMissing).toEqual([]);
      expect(empty.matchScore).toBe(99);

      // Disqualified job stays 0 and is excluded from scoredJobs counter
      const disqualified = byTitle("APC-50 Disqualified Job");
      expect(disqualified.disqualified).toBe(true);
      expect(disqualified.matchScore).toBe(0);

      // Debug summary contains exact aggregate integer counters and zero PII or skill names
      expect(summary).toEqual({
        threshold: 83,
        scoredJobs: 3,
        penalizedMustHave: 2,
        penalizedNiceToHave: 2,
        penalizedSoftSkills: 2,
      });
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain(testEmail);
      expect(serialized).not.toContain(userId);
      expect(serialized).not.toContain(profileId);
      expect(serialized).not.toContain("TestFixture");
    } finally {
      await restoreThreshold();
    }
  });

  it("immediately reflects live SystemConfig.SKILL_MATCH_DISPLAY_THRESHOLD updates on GET /api/jobs refresh", async () => {
    try {
      await setThreshold(83);
      const firstRun = await fetchJobsWithDebugSummary();
      const mixedBefore = firstRun.jobs.find(
        (j) => j.title === "APC-50 Mixed Partial Skills",
      )!;
      const allBelowBefore = firstRun.jobs.find(
        (j) => j.title === "APC-50 All Below Threshold",
      )!;

      expect(mixedBefore.missingSkills).toEqual([SKILL_KEYS.hardPartial]);
      expect(mixedBefore.matchScore).toBe(58);
      expect(allBelowBefore.matchScore).toBe(24);
      expect(firstRun.summary).toEqual({
        threshold: 83,
        scoredJobs: 3,
        penalizedMustHave: 2,
        penalizedNiceToHave: 2,
        penalizedSoftSkills: 2,
      });

      // Lower threshold from 83 -> 70 so 72-similarity skills flip from Missing (0) to Matched (72)
      await setThreshold(70);
      const secondRun = await fetchJobsWithDebugSummary();
      const mixedAfter = secondRun.jobs.find(
        (j) => j.title === "APC-50 Mixed Partial Skills",
      )!;
      const allBelowAfter = secondRun.jobs.find(
        (j) => j.title === "APC-50 All Below Threshold",
      )!;
      const emptyAfter = secondRun.jobs.find(
        (j) => j.title === "APC-50 Empty Skill Dimensions",
      )!;

      expect(mixedAfter.matchedSkills).toEqual([
        SKILL_KEYS.hardHigh,
        SKILL_KEYS.hardPartial,
      ]);
      expect(mixedAfter.missingSkills).toEqual([]);
      expect(mixedAfter.niceToHaveMatched).toEqual([
        SKILL_KEYS.hardHigh,
        SKILL_KEYS.hardPartial,
      ]);
      expect(mixedAfter.niceToHaveMissing).toEqual([]);
      expect(mixedAfter.softSkillsMatched).toEqual([
        SKILL_KEYS.softHigh,
        SKILL_KEYS.softPartial,
      ]);
      expect(mixedAfter.softSkillsMissing).toEqual([]);
      expect(mixedAfter.matchScore).toBe(85);
      expect(mixedAfter.matchScore!).toBeGreaterThan(mixedBefore.matchScore!);

      expect(allBelowAfter.matchedSkills).toEqual([SKILL_KEYS.hardPartial]);
      expect(allBelowAfter.missingSkills).toEqual([]);
      expect(allBelowAfter.niceToHaveMatched).toEqual([SKILL_KEYS.hardPartial]);
      expect(allBelowAfter.niceToHaveMissing).toEqual([]);
      expect(allBelowAfter.softSkillsMatched).toEqual([SKILL_KEYS.softPartial]);
      expect(allBelowAfter.softSkillsMissing).toEqual([]);
      expect(allBelowAfter.matchScore).toBe(78);
      expect(allBelowAfter.matchScore!).toBeGreaterThan(
        allBelowBefore.matchScore!,
      );

      expect(emptyAfter.matchScore).toBe(99);
      expect(secondRun.summary).toEqual({
        threshold: 70,
        scoredJobs: 3,
        penalizedMustHave: 0,
        penalizedNiceToHave: 0,
        penalizedSoftSkills: 0,
      });
    } finally {
      await restoreThreshold();
    }
  });
});

// Shared connection teardown for every suite in this file (runs after the last suite).
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});
