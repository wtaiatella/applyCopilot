import {
  checkDisqualification,
  computeOverlap,
  computeSeniorityFit,
  computePreferencesFit,
  computeMatchScore,
} from "@/services/matchScorer";
import type { JobFacts } from "@/lib/validation/jobFactsSchema";
import type { ProfileFacts } from "@/lib/validation/profileFactsSchema";
import type { UserPreferencesDTO } from "@/types/profile";

// --- Fixture factories -------------------------------------------------------------------

function makeJobFacts(overrides: Partial<JobFacts> = {}): JobFacts {
  return {
    mustHave: ["React", "TypeScript"],
    niceToHave: ["GraphQL"],
    softSkills: [],
    seniority: "mid",
    yearsExperienceMin: 3,
    employmentType: "permanent",
    workMode: "remote",
    isWorldwide: null,
    requiresUsWorkAuth: null,
    providesRelocationVisa: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    ...overrides,
  };
}

function makeProfileFacts(overrides: Partial<ProfileFacts> = {}): ProfileFacts {
  return {
    skills: ["React", "TypeScript"],
    softSkills: [],
    seniority: "mid",
    totalYearsExperience: 4,
    domains: [],
    ...overrides,
  };
}

function makePrefs(
  overrides: Partial<UserPreferencesDTO> = {},
): UserPreferencesDTO {
  return {
    seniority: null,
    totalYearsExperience: null,
    acceptsContract: null,
    acceptsFreelance: null,
    acceptsOnsite: null,
    acceptsHybrid: null,
    acceptsRemote: null,
    onlyWorldwide: null,
    hasUsWorkAuth: null,
    requiresVisaRelocation: null,
    salaryMin: null,
    salaryCurrency: null,
    excludeKeywords: [],
    ...overrides,
  };
}

// --- checkDisqualification ----------------------------------------------------------------

describe("checkDisqualification", () => {
  it("disqualifies when the user lacks US work auth and the job explicitly requires it", () => {
    const result = checkDisqualification(
      makeJobFacts({ requiresUsWorkAuth: true }),
      makePrefs({ hasUsWorkAuth: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/US work authorization/);
  });

  it("does NOT disqualify when US work auth is merely unstated (tri-state, not eliminatory)", () => {
    const result = checkDisqualification(
      makeJobFacts({ requiresUsWorkAuth: null }),
      makePrefs({ hasUsWorkAuth: false }),
    );
    expect(result.disqualified).toBe(false);
  });

  it("disqualifies when the user requires worldwide-only and the job is explicitly geo-restricted", () => {
    const result = checkDisqualification(
      makeJobFacts({ isWorldwide: false }),
      makePrefs({ onlyWorldwide: true }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/geo-restricted/);
  });

  it("does NOT disqualify when worldwide status is merely unstated", () => {
    const result = checkDisqualification(
      makeJobFacts({ isWorldwide: null }),
      makePrefs({ onlyWorldwide: true }),
    );
    expect(result.disqualified).toBe(false);
  });

  it("disqualifies contract jobs when the user rejects contract roles", () => {
    const result = checkDisqualification(
      makeJobFacts({ employmentType: "contract" }),
      makePrefs({ acceptsContract: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/Contract/);
  });

  it("disqualifies freelance jobs when the user rejects freelance roles", () => {
    const result = checkDisqualification(
      makeJobFacts({ employmentType: "freelance" }),
      makePrefs({ acceptsFreelance: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/Freelance/);
  });

  it("disqualifies onsite jobs when the user rejects onsite work", () => {
    const result = checkDisqualification(
      makeJobFacts({ workMode: "onsite" }),
      makePrefs({ acceptsOnsite: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/Onsite/);
  });

  it("disqualifies remote jobs when the user rejects remote work", () => {
    const result = checkDisqualification(
      makeJobFacts({ workMode: "remote" }),
      makePrefs({ acceptsRemote: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/Remote/);
  });

  it("disqualifies hybrid jobs when the user rejects hybrid work", () => {
    const result = checkDisqualification(
      makeJobFacts({ workMode: "hybrid" }),
      makePrefs({ acceptsHybrid: false }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/Hybrid/);
  });

  it("disqualifies when an excluded keyword appears in mustHave/niceToHave (case-insensitive)", () => {
    const result = checkDisqualification(
      makeJobFacts({ mustHave: ["Java", "COBOL"], niceToHave: [] }),
      makePrefs({ excludeKeywords: ["cobol"] }),
    );
    expect(result.disqualified).toBe(true);
    expect(result.reason).toMatch(/COBOL/i);
  });

  it("does not disqualify a job with no conflicts at all", () => {
    const result = checkDisqualification(makeJobFacts(), makePrefs());
    expect(result.disqualified).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

// --- computePreferencesFit (tri-state × 5 dimensions) --------------------------------------

describe("computePreferencesFit", () => {
  // worldwide/US-work-auth/visa are *optional* dimensions — only scored when the user has
  // actually expressed that preference. work-mode and salary are *always-active* dimensions
  // (they contribute a neutral 75 even when unstated). To isolate one optional dimension's
  // tri-state contribution, these fixtures pin work-mode/salary to their neutral (75) state so
  // the resulting blended average moves monotonically with the isolated dimension alone —
  // match > unstated > conflict, proven directly rather than coupled to the exact blend formula.
  function isolatedJobFacts(overrides: Partial<JobFacts> = {}): JobFacts {
    return makeJobFacts({ workMode: null, salaryMin: null, ...overrides });
  }
  function isolatedPrefs(
    overrides: Partial<UserPreferencesDTO> = {},
  ): UserPreferencesDTO {
    return makePrefs({ salaryMin: null, ...overrides });
  }

  describe("worldwide dimension (tri-state, isolated)", () => {
    it("explicit match scores higher than unstated, which scores higher than explicit conflict", () => {
      const match = computePreferencesFit(
        isolatedJobFacts({ isWorldwide: true }),
        isolatedPrefs({ onlyWorldwide: true }),
      );
      const unstated = computePreferencesFit(
        isolatedJobFacts({ isWorldwide: null }),
        isolatedPrefs({ onlyWorldwide: true }),
      );
      const conflict = computePreferencesFit(
        isolatedJobFacts({ isWorldwide: false }),
        isolatedPrefs({ onlyWorldwide: true }),
      );
      expect(match).toBeGreaterThan(unstated);
      expect(unstated).toBeGreaterThan(conflict);
      expect(conflict).toBe(50); // round((0 + 75 + 75) / 3)
      expect(match).toBe(83); // round((100 + 75 + 75) / 3)
    });
  });

  describe("US work-auth dimension (tri-state, isolated)", () => {
    it("explicit match scores higher than unstated, which scores higher than explicit conflict", () => {
      const match = computePreferencesFit(
        isolatedJobFacts({ requiresUsWorkAuth: false }),
        isolatedPrefs({ hasUsWorkAuth: false }),
      );
      const unstated = computePreferencesFit(
        isolatedJobFacts({ requiresUsWorkAuth: null }),
        isolatedPrefs({ hasUsWorkAuth: false }),
      );
      const conflict = computePreferencesFit(
        isolatedJobFacts({ requiresUsWorkAuth: true }),
        isolatedPrefs({ hasUsWorkAuth: false }),
      );
      expect(match).toBeGreaterThan(unstated);
      expect(unstated).toBeGreaterThan(conflict);
      expect(conflict).toBe(50);
      expect(match).toBe(83);
    });
  });

  describe("visa/relocation dimension (tri-state, isolated)", () => {
    it("explicit match scores higher than unstated, which scores higher than explicit conflict", () => {
      const match = computePreferencesFit(
        isolatedJobFacts({ providesRelocationVisa: true }),
        isolatedPrefs({ requiresVisaRelocation: true }),
      );
      const unstated = computePreferencesFit(
        isolatedJobFacts({ providesRelocationVisa: null }),
        isolatedPrefs({ requiresVisaRelocation: true }),
      );
      const conflict = computePreferencesFit(
        isolatedJobFacts({ providesRelocationVisa: false }),
        isolatedPrefs({ requiresVisaRelocation: true }),
      );
      expect(match).toBeGreaterThan(unstated);
      expect(unstated).toBeGreaterThan(conflict);
      expect(conflict).toBe(50);
      expect(match).toBe(83);
    });
  });

  // work-mode and salary are always-active dimensions (2-element blend with each other when the
  // 3 optional dimensions are all inactive) — exact values asserted directly.
  describe("work-mode dimension (always active)", () => {
    it("scores 88 for remote when accepted (100 blended with salary's neutral 75)", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: "remote", salaryMin: null }),
        makePrefs({ acceptsRemote: true, salaryMin: null }),
      );
      expect(score).toBe(88); // round((100 + 75) / 2)
    });
    it("scores 78 for hybrid when accepted (80 blended with salary's neutral 75)", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: "hybrid", salaryMin: null }),
        makePrefs({ acceptsHybrid: true, salaryMin: null }),
      );
      expect(score).toBe(78); // round((80 + 75) / 2)
    });
    it("scores 73 for onsite when accepted (70 blended with salary's neutral 75)", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: "onsite", salaryMin: null }),
        makePrefs({ acceptsOnsite: true, salaryMin: null }),
      );
      expect(score).toBe(73); // round((70 + 75) / 2)
    });
    it("scores 75 when both work-mode and salary are unstated", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: null, salaryMin: null }),
        makePrefs({ salaryMin: null }),
      );
      expect(score).toBe(75);
    });
    it("scores 38 when the job's work mode is explicitly rejected (0 blended with neutral 75)", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: "onsite", salaryMin: null }),
        makePrefs({ acceptsOnsite: false, salaryMin: null }),
      );
      expect(score).toBe(38); // round((0 + 75) / 2)
    });
  });

  describe("salary dimension (always active)", () => {
    it("scores 88 when job salaryMin meets/exceeds the user's minimum (100 blended with work-mode's neutral 75)", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: null, salaryMin: 120_000 }),
        makePrefs({ salaryMin: 100_000 }),
      );
      expect(score).toBe(88); // round((75 + 100) / 2)
    });
    it("scores 75 when unstated on either side", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: null, salaryMin: null }),
        makePrefs({ salaryMin: null }),
      );
      expect(score).toBe(75);
    });
    it("scores a partial ratio-based value when job salary is below the user's minimum", () => {
      const score = computePreferencesFit(
        makeJobFacts({ workMode: null, salaryMin: 50_000 }),
        makePrefs({ salaryMin: 100_000 }),
      );
      // salary sub-score: ratio 0.5 * 80 = 40; blended with work-mode's neutral 75 -> round((75+40)/2)
      expect(score).toBe(58);
    });
  });

  it("returns a fully neutral 75 when the user has no preferences set at all (only the always-active dimensions contribute)", () => {
    const score = computePreferencesFit(
      makeJobFacts({ workMode: null, salaryMin: null }),
      makePrefs(),
    );
    expect(score).toBe(75);
  });
});

// --- computeSeniorityFit --------------------------------------------------------------------

describe("computeSeniorityFit", () => {
  it("scores 100 when candidate seniority matches the job's required seniority exactly", () => {
    expect(computeSeniorityFit("mid", "mid", null, null)).toBe(100);
  });

  it("scores 90 when candidate is one level above the required seniority", () => {
    expect(computeSeniorityFit("mid", "senior", null, null)).toBe(90);
  });

  it("scores 75 when candidate is significantly overqualified (2+ levels above)", () => {
    expect(computeSeniorityFit("junior", "principal", null, null)).toBe(75);
  });

  it("scores 50 when candidate is one level below the required seniority", () => {
    expect(computeSeniorityFit("senior", "mid", null, null)).toBe(50);
  });

  it("scores 20 when candidate is significantly underqualified (2+ levels below)", () => {
    expect(computeSeniorityFit("principal", "junior", null, null)).toBe(20);
  });

  it("scores 100 on years when candidate meets/exceeds the job's minimum years", () => {
    expect(computeSeniorityFit(null, null, 3, 5)).toBe(100);
  });

  it("scores 100 on years when the job's minimum years is 0", () => {
    expect(computeSeniorityFit(null, null, 0, 0)).toBe(100);
  });

  it("scores a partial ratio-based value when candidate years fall short", () => {
    // ratio = 2/4 = 0.5 * 90 = 45
    expect(computeSeniorityFit(null, null, 4, 2)).toBe(45);
  });

  it("blends ordinal and years sub-scores when both dimensions are stated", () => {
    // ordinal exact match = 100, years exceeds = 100 -> average 100
    expect(computeSeniorityFit("mid", "mid", 2, 5)).toBe(100);
  });

  it("returns a neutral 70 when both seniority and years are unstated on at least one side", () => {
    expect(computeSeniorityFit(null, null, null, null)).toBe(70);
  });
});

// --- computeOverlap --------------------------------------------------------------------------

describe("computeOverlap", () => {
  it("returns 100 when the target list is empty (nothing requested)", () => {
    expect(computeOverlap([], ["React"])).toBe(100);
  });

  it("returns 0 when there is no overlap at all", () => {
    expect(computeOverlap(["GraphQL", "AWS"], ["React", "Vue"])).toBe(0);
  });

  it("returns a partial percentage for a partial overlap", () => {
    expect(computeOverlap(["GraphQL", "AWS"], ["AWS"])).toBe(50);
  });

  it("returns 100 for a full overlap, case-insensitively", () => {
    expect(computeOverlap(["graphql", "AWS"], ["GraphQL", "aws"])).toBe(100);
  });
});

// --- computeMatchScore (end-to-end weighting + matched/missing) ------------------------------

describe("computeMatchScore", () => {
  it("short-circuits to a 0 score with empty matched/missing arrays when disqualified", () => {
    const result = computeMatchScore(
      {
        jobFacts: makeJobFacts({ requiresUsWorkAuth: true }),
        mustHaveSimilarity: 95,
      },
      { profileFacts: makeProfileFacts() },
      makePrefs({ hasUsWorkAuth: false }),
    );
    expect(result).toEqual({
      score: 0,
      matchedSkills: [],
      missingSkills: [],
      niceToHaveMatched: [],
      disqualified: true,
      disqualifyReason: expect.stringMatching(/US work authorization/),
    });
  });

  it("computes the weighted sum (0.45/0.15/0.20/0.20) when not disqualified", () => {
    // mustHaveSimilarity=100 (0.45), niceToHave full overlap=100 (0.15),
    // seniority exact match, unstated years -> ordinal-only = 100 (0.20),
    // no preferences set, work-mode unstated -> 75 (0.20)
    const result = computeMatchScore(
      {
        jobFacts: makeJobFacts({
          mustHave: ["React"],
          niceToHave: ["GraphQL"],
          seniority: "mid",
          yearsExperienceMin: null,
          workMode: null,
        }),
        mustHaveSimilarity: 100,
      },
      { profileFacts: makeProfileFacts({ skills: ["React", "GraphQL"] }) },
      makePrefs({ seniority: "mid" }),
    );

    // 100*0.45 + 100*0.15 + 100*0.20 + 75*0.20 = 45 + 15 + 20 + 15 = 95
    expect(result.score).toBe(95);
    expect(result.disqualified).toBe(false);
    expect(result.matchedSkills).toEqual(["React"]);
    expect(result.missingSkills).toEqual([]);
    expect(result.niceToHaveMatched).toEqual(["GraphQL"]);
  });

  it("computes matchedSkills/missingSkills as the correct set difference against mustHave", () => {
    const result = computeMatchScore(
      {
        jobFacts: makeJobFacts({
          mustHave: ["React", "TypeScript", "Node.js"],
          niceToHave: [],
        }),
        mustHaveSimilarity: 50,
      },
      { profileFacts: makeProfileFacts({ skills: ["React", "TypeScript"] }) },
      makePrefs(),
    );

    expect(result.matchedSkills.sort()).toEqual(["React", "TypeScript"].sort());
    expect(result.missingSkills).toEqual(["Node.js"]);
  });
});

// --- SC-01: 100-fixture matrix, ≥60 percentage-point score spread ---------------------------

describe("computeMatchScore fixture matrix (SC-01, ≥60pp score spread)", () => {
  const SENIORITIES = ["junior", "mid", "senior", "lead", "principal"] as const;
  const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

  it("produces at least a 60 percentage-point spread across 100 varied fixtures", () => {
    const scores: number[] = [];

    for (let i = 0; i < 100; i++) {
      const seniority = SENIORITIES[i % SENIORITIES.length];
      const candidateSeniority =
        SENIORITIES[(i + Math.floor(i / 5)) % SENIORITIES.length];
      const workMode = WORK_MODES[i % WORK_MODES.length];
      // Similarity spans the full 0-100 range across the fixture set.
      const mustHaveSimilarity = (i * 97) % 101;
      // Alternate profile skill coverage between none, partial, and full.
      const jobMustHave = ["React", "TypeScript", "Node.js"];
      const profileSkills =
        i % 3 === 0
          ? []
          : i % 3 === 1
            ? ["React"]
            : ["React", "TypeScript", "Node.js"];

      const result = computeMatchScore(
        {
          jobFacts: makeJobFacts({
            mustHave: jobMustHave,
            niceToHave: i % 2 === 0 ? ["GraphQL"] : [],
            seniority,
            yearsExperienceMin: i % 4,
            workMode,
            employmentType: "permanent",
          }),
          mustHaveSimilarity,
        },
        {
          profileFacts: makeProfileFacts({
            skills: profileSkills,
            seniority: "mid",
            totalYearsExperience: i % 6,
          }),
        },
        makePrefs({
          seniority: candidateSeniority,
          totalYearsExperience: i % 6,
          acceptsRemote: true,
          acceptsHybrid: true,
          acceptsOnsite: true,
        }),
      );

      scores.push(result.score);
    }

    expect(scores).toHaveLength(100);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    expect(max - min).toBeGreaterThanOrEqual(60);
  });
});
