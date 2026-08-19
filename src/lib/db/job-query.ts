import { prisma } from "./prisma";
import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";
import type { JobFacts } from "@/lib/validation/jobFactsSchema";

export interface JobSimilarityResult {
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
  mustHaveSimilarity: number | null;
}

/**
 * Stage 1 (pgvector prefilter) of the two-stage ranking pipeline (spectech.md Architecture):
 * retrieves the top `poolSize` job listings ordered by cosine similarity between the user's
 * profile embedding and each job's `mustHave`-only embedding, including each job's `jobFacts`
 * JSON so Stage 2 (`matchScorer.computeMatchScore`, in-memory, no I/O) can compute the final
 * composite score without a second DB round-trip per candidate.
 *
 * `poolSize` is intentionally decoupled from the client's requested page size — it always
 * bounds the Stage-1 SQL candidate pool (default 300), independent of how many jobs the caller
 * ultimately renders (FR-12). Falls back to ordering by postedAt/createdAt descending with
 * `mustHaveSimilarity: null` when no profile embedding is provided.
 *
 * @param profileEmbedding The EMBEDDING_DIMENSION-dimension vector embedding of the user's
 *   profile skills, or null.
 * @param daysLimit Max age of jobs in days (calculated from postedAt/createdAt).
 * @param poolSize Max number of Stage-1 candidates to return (default 300).
 */
export async function getJobsWithSimilarity(
  profileEmbedding: number[] | null,
  daysLimit: number = 15,
  poolSize: number = 300,
): Promise<JobSimilarityResult[]> {
  // Guard against a non-finite/NaN caller-supplied value reaching Math.max/Math.min (which never
  // resolve NaN to a finite number) and, in turn, the raw SQL LIMIT/INTERVAL — fall back to this
  // function's own defaults, matching the defaults declared on its parameters.
  const safeDaysLimit = Number.isFinite(daysLimit) ? daysLimit : 15;
  const safePoolSize = Number.isFinite(poolSize) ? poolSize : 300;
  const days = Math.max(1, safeDaysLimit);
  const maxPoolSize = Math.max(1, safePoolSize);

  if (profileEmbedding && profileEmbedding.length === EMBEDDING_DIMENSION) {
    const vectorStr = `[${profileEmbedding.join(",")}]`;

    // Similarity as a percentage: (1 - cosine_distance) * 100 — aliased "mustHaveSimilarity"
    // (not "matchScore") because this is only the Stage-1 SQL prefilter score; the final,
    // client-facing matchScore is Stage 2's composite (spectech.md Technical Decisions).
    return prisma.$queryRawUnsafe<JobSimilarityResult[]>(
      `
      SELECT
        id,
        "portalId",
        "externalJobId",
        title,
        company,
        location,
        url,
        "postedAt",
        "createdAt",
        "classificationStatus",
        "isFullDescriptionFetched",
        "fullDescription",
        "jobFacts",
        ((1 - (embedding <=> $1::vector)) * 100) as "mustHaveSimilarity"
      FROM "JobListing"
      WHERE "classificationStatus" = 'COMPLETED'
        AND ("postedAt" >= NOW() - $2 * INTERVAL '1 day' OR "postedAt" IS NULL)
      ORDER BY "mustHaveSimilarity" DESC NULLS LAST, COALESCE("postedAt", "createdAt") DESC
      LIMIT $3;
      `,
      vectorStr,
      days,
      maxPoolSize,
    );
  } else {
    // Fallback: Return sorted by postedAt/createdAt descending, mustHaveSimilarity is null
    return prisma.$queryRawUnsafe<JobSimilarityResult[]>(
      `
      SELECT
        id,
        "portalId",
        "externalJobId",
        title,
        company,
        location,
        url,
        "postedAt",
        "createdAt",
        "classificationStatus",
        "isFullDescriptionFetched",
        "fullDescription",
        "jobFacts",
        NULL as "mustHaveSimilarity"
      FROM "JobListing"
      WHERE "classificationStatus" = 'COMPLETED'
        AND ("postedAt" >= NOW() - $1 * INTERVAL '1 day' OR "postedAt" IS NULL)
      ORDER BY COALESCE("postedAt", "createdAt") DESC
      LIMIT $2;
      `,
      days,
      maxPoolSize,
    );
  }
}
