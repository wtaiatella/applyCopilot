import type { JobFacts } from "@/lib/validation/jobFactsSchema";
import type { ProfileFacts } from "@/lib/validation/profileFactsSchema";
import type { UserPreferencesDTO } from "@/types/profile";

/**
 * Pure Stage-2 composite scorer (spectech.md Architecture, Technical Decisions) — no
 * Prisma/fetch/network calls. All I/O for the scoring path lives in `job-query.ts` (Stage-1 SQL)
 * and `jobs/route.ts` (DB reads); this module only combines already-fetched
 * `JobFacts`/`ProfileFacts`/`UserPreferences` into a deterministic 0-100 match score.
 *
 * Mirrors `match-score-architecture.md` §3.5/§3.6's reference implementation exactly (weights,
 * tri-state sub-scores, disqualification rules); the exact `computeSeniorityFit` curve is a
 * documented technical default (spectech.md Clarifications & Assumptions — only the 0.20 weight
 * and its two inputs are pinned, not the curve shape).
 */

const SENIORITY_ORDER: Record<string, number> = {
  junior: 0,
  mid: 1,
  senior: 2,
  lead: 3,
  principal: 4,
};

export interface DisqualificationResult {
  disqualified: boolean;
  reason?: string;
}

/**
 * Hard eliminatories — reserved for explicit, confirmed blockers only (never for merely
 * unstated/omitted job facts, which the tri-state `computePreferencesFit` handles instead).
 */
export function checkDisqualification(
  jobFacts: JobFacts,
  prefs: UserPreferencesDTO,
): DisqualificationResult {
  if (prefs.hasUsWorkAuth === false && jobFacts.requiresUsWorkAuth === true) {
    return {
      disqualified: true,
      reason: "Requires US work authorization, which you do not have",
    };
  }

  if (prefs.onlyWorldwide === true && jobFacts.isWorldwide === false) {
    return {
      disqualified: true,
      reason:
        "Job is explicitly geo-restricted; you require worldwide-eligible roles",
    };
  }

  if (
    jobFacts.employmentType === "contract" &&
    prefs.acceptsContract === false
  ) {
    return {
      disqualified: true,
      reason: "Contract employment type rejected in your preferences",
    };
  }
  if (
    jobFacts.employmentType === "freelance" &&
    prefs.acceptsFreelance === false
  ) {
    return {
      disqualified: true,
      reason: "Freelance employment type rejected in your preferences",
    };
  }

  if (jobFacts.workMode === "onsite" && prefs.acceptsOnsite === false) {
    return {
      disqualified: true,
      reason: "Onsite work mode rejected in your preferences",
    };
  }
  if (jobFacts.workMode === "remote" && prefs.acceptsRemote === false) {
    return {
      disqualified: true,
      reason: "Remote work mode rejected in your preferences",
    };
  }
  if (jobFacts.workMode === "hybrid" && prefs.acceptsHybrid === false) {
    return {
      disqualified: true,
      reason: "Hybrid work mode rejected in your preferences",
    };
  }

  const description =
    `${jobFacts.mustHave.join(" ")} ${jobFacts.niceToHave.join(" ")}`.toLowerCase();
  const matchedKeyword = prefs.excludeKeywords.find((keyword) =>
    description.includes(keyword.toLowerCase()),
  );
  if (matchedKeyword) {
    return {
      disqualified: true,
      reason: `Contains excluded keyword: "${matchedKeyword}"`,
    };
  }

  return { disqualified: false };
}

/**
 * Case-insensitive overlap ratio (0-100) between a job's skill list (mustHave/niceToHave) and
 * the profile's skill list. Returns 100 when `target` is empty — nothing was requested, so
 * there's nothing to be missing.
 */
export function computeOverlap(
  target: string[],
  profileSkills: string[],
): number {
  if (target.length === 0) return 100;

  const profileSet = new Set(profileSkills.map((s) => s.toLowerCase()));
  const matched = target.filter((skill) => profileSet.has(skill.toLowerCase()));
  return Math.round((matched.length / target.length) * 100);
}

/**
 * Deterministic ordinal + years-ratio blend comparing the job's required seniority/years
 * against the candidate's own *declared preferences* (`UserPreferences.seniority`/
 * `totalYearsExperience` — not `profileFacts`, per `match-score-architecture.md` §3.5's
 * `computeSeniorityFit(job.jobFacts.seniority, preferences.seniority, ...)` signature).
 * Unstated dimensions on either side fall back to a neutral score rather than penalizing.
 */
export function computeSeniorityFit(
  jobSeniority: JobFacts["seniority"],
  prefSeniority: UserPreferencesDTO["seniority"],
  jobYearsMin: number | null,
  prefYears: number | null,
): number {
  let ordinalScore: number | null = null;
  if (jobSeniority !== null && prefSeniority !== null) {
    const diff = SENIORITY_ORDER[prefSeniority] - SENIORITY_ORDER[jobSeniority];
    if (diff === 0) ordinalScore = 100;
    else if (diff === 1)
      ordinalScore = 90; // one level above target — still a great fit
    else if (diff > 1)
      ordinalScore = 75; // overqualified
    else if (diff === -1)
      ordinalScore = 50; // one level below target — possible stretch
    else ordinalScore = 20; // significantly under the required seniority
  }

  let yearsScore: number | null = null;
  if (jobYearsMin !== null && prefYears !== null) {
    if (jobYearsMin === 0 || prefYears >= jobYearsMin) {
      yearsScore = 100;
    } else {
      const ratio = prefYears / jobYearsMin;
      yearsScore = Math.max(0, Math.round(ratio * 90));
    }
  }

  const scores = [ordinalScore, yearsScore].filter(
    (s): s is number => s !== null,
  );
  if (scores.length === 0) return 70; // both dimensions unstated on at least one side — neutral
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Tri-state preference evaluation (Explicit Match=100 / Not Stated=70 / Explicit Conflict=0)
 * across 5 dimensions: worldwide, US work auth, visa/relocation, work mode, salary. A dimension
 * is only scored when the user has actually expressed a preference for it; if the user has no
 * preferences set at all, returns 100 (nothing to evaluate against).
 */
export function computePreferencesFit(
  jobFacts: JobFacts,
  prefs: UserPreferencesDTO,
): number {
  const subScores: number[] = [];

  if (prefs.onlyWorldwide === true) {
    if (jobFacts.isWorldwide === true) subScores.push(100);
    else if (jobFacts.isWorldwide === null) subScores.push(70);
    else subScores.push(0);
  }

  if (prefs.hasUsWorkAuth === false) {
    if (jobFacts.requiresUsWorkAuth === false) subScores.push(100);
    else if (jobFacts.requiresUsWorkAuth === null) subScores.push(70);
    else subScores.push(0);
  }

  if (prefs.requiresVisaRelocation === true) {
    if (jobFacts.providesRelocationVisa === true) subScores.push(100);
    else if (jobFacts.providesRelocationVisa === null) subScores.push(70);
    else subScores.push(0);
  }

  if (jobFacts.workMode) {
    if (jobFacts.workMode === "remote" && prefs.acceptsRemote !== false) {
      subScores.push(100);
    } else if (
      jobFacts.workMode === "hybrid" &&
      prefs.acceptsHybrid !== false
    ) {
      subScores.push(80);
    } else if (
      jobFacts.workMode === "onsite" &&
      prefs.acceptsOnsite !== false
    ) {
      subScores.push(70);
    } else {
      subScores.push(0);
    }
  } else {
    subScores.push(75); // unstated work mode
  }

  if (prefs.salaryMin && jobFacts.salaryMin) {
    if (jobFacts.salaryMin >= prefs.salaryMin) {
      subScores.push(100);
    } else {
      const ratio = jobFacts.salaryMin / prefs.salaryMin;
      subScores.push(Math.max(0, Math.round(ratio * 80)));
    }
  } else {
    subScores.push(75); // unstated salary is neutral
  }

  if (subScores.length === 0) return 100; // user has no specific preferences set
  return Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length);
}

export interface MatchScoreResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  niceToHaveMatched: string[];
  disqualified: boolean;
  disqualifyReason: string | null;
}

/**
 * Stage-2 composite score for one Stage-1 candidate: weighted sum of must-have similarity
 * (0.45, from Stage 1's SQL), nice-to-have overlap (0.15), seniority fit (0.20), and tri-state
 * preferences fit (0.20) — unless `checkDisqualification` short-circuits to a hard 0.
 */
export function computeMatchScore(
  job: { jobFacts: JobFacts; mustHaveSimilarity: number },
  profile: { profileFacts: ProfileFacts },
  preferences: UserPreferencesDTO,
): MatchScoreResult {
  const elimination = checkDisqualification(job.jobFacts, preferences);
  if (elimination.disqualified) {
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: [],
      niceToHaveMatched: [],
      disqualified: true,
      disqualifyReason: elimination.reason ?? null,
    };
  }

  const mustHaveScore = job.mustHaveSimilarity;
  const niceToHaveScore = computeOverlap(
    job.jobFacts.niceToHave,
    profile.profileFacts.skills,
  );
  const seniorityScore = computeSeniorityFit(
    job.jobFacts.seniority,
    preferences.seniority,
    job.jobFacts.yearsExperienceMin,
    preferences.totalYearsExperience,
  );
  const preferencesScore = computePreferencesFit(job.jobFacts, preferences);

  const score =
    mustHaveScore * 0.45 +
    niceToHaveScore * 0.15 +
    seniorityScore * 0.2 +
    preferencesScore * 0.2;

  const profileSkillsLower = new Set(
    profile.profileFacts.skills.map((s) => s.toLowerCase()),
  );
  const matchedSkills = job.jobFacts.mustHave.filter((skill) =>
    profileSkillsLower.has(skill.toLowerCase()),
  );
  const missingSkills = job.jobFacts.mustHave.filter(
    (skill) => !profileSkillsLower.has(skill.toLowerCase()),
  );
  const niceToHaveMatched = job.jobFacts.niceToHave.filter((skill) =>
    profileSkillsLower.has(skill.toLowerCase()),
  );

  return {
    score: Math.round(score),
    matchedSkills,
    missingSkills,
    niceToHaveMatched,
    disqualified: false,
    disqualifyReason: null,
  };
}
