import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getJobsWithSimilarity } from "@/lib/db/job-query";
import { computeMatchScore } from "@/services/matchScorer";
import type { ProfileFacts } from "@/lib/validation/profileFactsSchema";
import type { JobFacts } from "@/lib/validation/jobFactsSchema";
import type { UserPreferencesDTO } from "@/types/profile";
import { logger } from "@/lib/logging/logger";

// Fixed Stage-1 SQL prefilter pool size — intentionally decoupled from the client's requested
// page size (FR-12, spectech.md Architecture "Two-stage ranking" Technical Decision).
const STAGE1_POOL_SIZE = 300;

// Same all-null default shape as GET /api/profile/preferences (spectech.md Clarifications &
// Assumptions) — used whenever the user never saved preferences, so Stage 2 still runs with
// "no preferences set" semantics (computePreferencesFit/checkDisqualification treat every
// dimension as unset, i.e. non-blocking).
const DEFAULT_PREFERENCES: UserPreferencesDTO = {
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
};

interface ScoredJob {
  id: string;
  portalId: string;
  externalJobId: string;
  title: string;
  company: string;
  location: string[];
  url: string;
  postedAt: Date | null;
  createdAt: Date;
  classificationStatus: string;
  isFullDescriptionFetched: boolean;
  fullDescription: string | null;
  jobFacts: JobFacts | null;
  matchScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  niceToHaveMatched: string[];
  disqualified: boolean;
  disqualifyReason: string | null;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const daysVal = searchParams.get("days");
    const limitVal = searchParams.get("limit");
    const minMatchVal = searchParams.get("minMatch");

    const days = daysVal ? parseInt(daysVal, 10) : 15;
    const rawLimit = limitVal ? parseInt(limitVal, 10) : 50;
    // Clamp to [1, 100] regardless of requested value — out-of-range values are clamped, not
    // rejected, so no new error path is introduced for existing callers (REM-12, spectech.md
    // API Contracts). A non-numeric `limit` query param (e.g. `?limit=abc`) parses to NaN, which
    // must fall back to the default before clamping — Math.min/Math.max never resolve a NaN
    // input to a finite value, so an unguarded NaN would otherwise reach the slice below.
    const safeRawLimit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const limit = Math.min(100, Math.max(1, safeRawLimit));
    const minMatch = minMatchVal ? parseFloat(minMatchVal) : null;

    // Load profile id/embedding/profileFacts in one raw query — embedding is an Unsupported
    // pgvector type Prisma's standard selectors omit; profileFacts is fetched alongside it so
    // Stage 2 needs no second profile round-trip.
    const profileResult = await prisma.$queryRaw<
      Array<{
        id: string;
        embeddingText: string | null;
        profileFacts: ProfileFacts | null;
      }>
    >`
      SELECT id, embedding::text as "embeddingText", "profileFacts"
      FROM "UserProfile" WHERE "userId" = ${userId} LIMIT 1
    `;
    const profileRow = profileResult[0] ?? null;

    let profileEmbedding: number[] | null = null;
    if (profileRow?.embeddingText) {
      try {
        profileEmbedding = JSON.parse(profileRow.embeddingText);
      } catch (err) {
        logger.error("Failed to parse user profile embedding vector from DB", {
          err,
        });
      }
    }

    // Stage 1 (SQL prefilter): fixed pool size, independent of the client's requested `limit`.
    const stage1Jobs = await getJobsWithSimilarity(
      profileEmbedding,
      days,
      STAGE1_POOL_SIZE,
    );

    let preferences: UserPreferencesDTO = DEFAULT_PREFERENCES;
    if (profileRow) {
      const prefsRow = await prisma.userPreferences.findUnique({
        where: { profileId: profileRow.id },
      });
      if (prefsRow) {
        preferences = {
          seniority: prefsRow.seniority as UserPreferencesDTO["seniority"],
          totalYearsExperience: prefsRow.totalYearsExperience,
          acceptsContract: prefsRow.acceptsContract,
          acceptsFreelance: prefsRow.acceptsFreelance,
          acceptsOnsite: prefsRow.acceptsOnsite,
          acceptsHybrid: prefsRow.acceptsHybrid,
          acceptsRemote: prefsRow.acceptsRemote,
          onlyWorldwide: prefsRow.onlyWorldwide,
          hasUsWorkAuth: prefsRow.hasUsWorkAuth,
          requiresVisaRelocation: prefsRow.requiresVisaRelocation,
          salaryMin: prefsRow.salaryMin,
          salaryCurrency: prefsRow.salaryCurrency,
          excludeKeywords: prefsRow.excludeKeywords,
        };
      }
    }

    // Stage 2 (Node.js composite scorer): only runs when the profile has both an embedding and
    // extracted profileFacts — FR-17: no embedding means matchScore stays null for every job and
    // the client falls back to its existing "Sync Profile" badge state.
    const canScore =
      profileEmbedding !== null && profileRow?.profileFacts != null;
    const profileFacts = profileRow?.profileFacts ?? null;

    let scoredJobs: ScoredJob[] = stage1Jobs.map((job) => {
      if (canScore && job.jobFacts && job.mustHaveSimilarity !== null) {
        const result = computeMatchScore(
          {
            jobFacts: job.jobFacts,
            mustHaveSimilarity: job.mustHaveSimilarity,
          },
          { profileFacts: profileFacts as ProfileFacts },
          preferences,
        );
        return {
          ...job,
          matchScore: result.score,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
          niceToHaveMatched: result.niceToHaveMatched,
          disqualified: result.disqualified,
          disqualifyReason: result.disqualifyReason,
        };
      }

      // Not yet classified (no jobFacts) or profile isn't scoreable — no composite score,
      // never disqualified (there's nothing to disqualify against).
      return {
        ...job,
        matchScore: null,
        matchedSkills: [],
        missingSkills: [],
        niceToHaveMatched: [],
        disqualified: false,
        disqualifyReason: null,
      };
    });

    // Sort: disqualified jobs demoted to the end, then by composite score DESC, then jobs with
    // no score at all last within their group (spectech.md Architecture — Stage 2 sort
    // contract).
    scoredJobs.sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      if (a.matchScore === null && b.matchScore === null) return 0;
      if (a.matchScore === null) return 1;
      if (b.matchScore === null) return -1;
      return b.matchScore - a.matchScore;
    });

    // Apply minMatch filter on the FINAL composite score, then slice to the client's requested/
    // clamped limit (1-100, unchanged) — the same minMatch/limit contract as before, now
    // operating on Stage 2's composite score instead of Stage 1's raw similarity.
    if (minMatch !== null && !isNaN(minMatch)) {
      scoredJobs = scoredJobs.filter(
        (job) => job.matchScore === null || job.matchScore >= minMatch,
      );
    }
    scoredJobs = scoredJobs.slice(0, limit);

    // One additional batched JobFavorite lookup (not per-row) merged into the ranked-jobs
    // response — two total queries for the whole page load, not one per job (US-7, FR-17).
    let favoritedJobIds = new Set<string>();
    if (profileRow && scoredJobs.length > 0) {
      const favorites = await prisma.jobFavorite.findMany({
        where: {
          profileId: profileRow.id,
          jobListingId: { in: scoredJobs.map((job) => job.id) },
        },
        select: { jobListingId: true },
      });
      favoritedJobIds = new Set(favorites.map((f) => f.jobListingId));
    }

    const response = scoredJobs.map((job) => ({
      id: job.id,
      portalId: job.portalId,
      externalJobId: job.externalJobId,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      postedAt: job.postedAt,
      createdAt: job.createdAt,
      classificationStatus: job.classificationStatus,
      isFullDescriptionFetched: job.isFullDescriptionFetched,
      fullDescription: job.fullDescription,
      matchScore: job.matchScore,
      matchedSkills: job.matchedSkills,
      missingSkills: job.missingSkills,
      niceToHaveMatched: job.niceToHaveMatched,
      disqualified: job.disqualified,
      disqualifyReason: job.disqualifyReason,
      favorite: favoritedJobIds.has(job.id),
      jobFacts: job.jobFacts
        ? {
            niceToHave: job.jobFacts.niceToHave,
            seniority: job.jobFacts.seniority,
            yearsExperienceMin: job.jobFacts.yearsExperienceMin,
            workMode: job.jobFacts.workMode,
            isWorldwide: job.jobFacts.isWorldwide,
            requiresUsWorkAuth: job.jobFacts.requiresUsWorkAuth,
            providesRelocationVisa: job.jobFacts.providesRelocationVisa,
            employmentType: job.jobFacts.employmentType,
            salaryMin: job.jobFacts.salaryMin,
            salaryMax: job.jobFacts.salaryMax,
            currency: job.jobFacts.currency,
          }
        : null,
    }));

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching ranked jobs", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
