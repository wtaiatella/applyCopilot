/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getJobsHandler } from "@/app/api/jobs/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

interface JobsApiResponseItem {
  id: string;
  title: string;
  matchScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
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
// canonicalization write path, so "React"/"TypeScript"/"Node.js" have no cached vector by
// default and correctly-but-differently graceful-degrade to a 0 item score (spectech.md's
// documented degrade rule) instead of the >=skillMatchThreshold match the string-overlap era
// produced. Seed canonical `SkillEmbedding` rows here for exactly the skills this suite expects
// to resolve as "matched" — every fixture vector is a constant-fill vector, so any two of them
// are cosine-identical (1.0) regardless of the fill value, mirroring the pattern already used
// by tests/integration/profile-sync.test.ts's default 0.123-fill "react"/"node.js" rows. "Rust"
// and "Go" (Low Match Job's mustHave) are deliberately left unseeded so they keep degrading to
// 0, preserving this suite's great-vs-low composite-score ordering assertions.
// `ON CONFLICT DO NOTHING` makes this idempotent against those pre-existing shared rows and safe
// to re-run — no per-test cleanup, matching the codebase's existing convention of treating common
// canonical skill vocabulary as a persistent, self-healing fixture rather than a per-test one.
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
    skills: ["React", "TypeScript", "Node.js"],
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
      seedSkillEmbedding("react", "React"),
      seedSkillEmbedding("typescript", "TypeScript"),
      seedSkillEmbedding("node.js", "Node.js"),
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
          mustHave: ["React", "TypeScript"],
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
          mustHave: ["React", "TypeScript", "Node.js"],
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
    await prisma.userPreferences
      .deleteMany({ where: { profileId } })
      .catch(() => {});
    await prisma.jobListing
      .deleteMany({ where: { id: { in: createdJobIds } } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
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
    expect([...great.matchedSkills].sort()).toEqual(["React", "TypeScript"]);
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
      await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
    }
  });
});
