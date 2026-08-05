import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type { TrackerListRow } from "@/types/application";

// Raw shape returned by the single consolidated query below — Postgres returns booleans as
// JS booleans and the CASE-derived cvStatus/applicationStage columns as plain strings/null via
// the pg driver, so no further per-row coercion is needed beyond typing the result.
interface TrackerListRawRow {
  jobId: string;
  title: string;
  company: string;
  favorite: boolean;
  deepAnalysisDone: boolean;
  cvStatus: "not_started" | "draft" | "applied";
  applicationStage: TrackerListRow["applicationStage"];
}

/**
 * List view's single consolidated read (FR-19, FR-20, AC.9): one raw SQL query, LEFT JOINing
 * `JobFavorite` + `JobAnalysis` + `CV` + `Application` onto `JobListing`, each scoped to
 * `profileId` in the JOIN condition (not filtered client-side) — exactly one round trip to the
 * database regardless of job count, replacing the old hub page's per-job
 * `GET /api/jobs/{id}/analyze` + `GET /api/jobs/{id}/cv` N+1 pattern (spectech.md "Technical
 * Decisions" and API Contracts).
 *
 * Only jobs with at least one per-candidate row (favorited, analyzed, drafted, or applied) are
 * returned — a job the candidate has never touched has no row in any of the four joined tables.
 */
export async function getTrackerListRows(
  profileId: string,
): Promise<TrackerListRow[]> {
  const startedAt = Date.now();
  const rows = await prisma.$queryRaw<TrackerListRawRow[]>`
    SELECT
      jl.id AS "jobId",
      jl.title AS "title",
      jl.company AS "company",
      (fav.id IS NOT NULL) AS "favorite",
      (ja.id IS NOT NULL) AS "deepAnalysisDone",
      CASE
        WHEN cv.status = 'APPLIED' THEN 'applied'
        WHEN cv.status = 'DRAFT' THEN 'draft'
        ELSE 'not_started'
      END AS "cvStatus",
      a.stage AS "applicationStage"
    FROM "JobListing" jl
    LEFT JOIN "JobFavorite" fav ON fav."jobListingId" = jl.id AND fav."profileId" = ${profileId}
    LEFT JOIN "JobAnalysis" ja ON ja."jobId" = jl.id AND ja."profileId" = ${profileId}
    LEFT JOIN "CV" cv ON cv."jobListingId" = jl.id AND cv."profileId" = ${profileId}
    LEFT JOIN "Application" a ON a."jobListingId" = jl.id AND a."profileId" = ${profileId}
    WHERE fav.id IS NOT NULL OR ja.id IS NOT NULL OR cv.id IS NOT NULL OR a.id IS NOT NULL
    ORDER BY jl."createdAt" DESC
  `;

  logger.info("application_tracker_list_fetched", {
    profileId,
    jobCount: rows.length,
    queryDurationMs: Date.now() - startedAt,
  });

  return rows.map((row) => ({
    jobId: row.jobId,
    title: row.title,
    company: row.company,
    favorite: row.favorite,
    deepAnalysisDone: row.deepAnalysisDone,
    cvStatus: row.cvStatus,
    applicationStage: row.applicationStage,
  }));
}
