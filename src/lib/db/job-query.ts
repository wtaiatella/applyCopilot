import { prisma } from "./prisma";

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
  matchScore: number | null;
}

/**
 * Retrieves job listings dynamically ranked by semantic similarity to the user's profile embedding.
 * Falls back to ordering by postedAt / createdAt descending if no embedding is provided.
 *
 * @param profileEmbedding The 512-dimension vector embedding of the user's profile, or null.
 * @param daysLimit Max age of jobs in days (calculated from postedAt/createdAt).
 * @param limit Max number of jobs to return.
 */
export async function getJobsWithSimilarity(
  profileEmbedding: number[] | null,
  daysLimit: number = 15,
  limit: number = 50
): Promise<JobSimilarityResult[]> {
  const days = Math.max(1, daysLimit);
  const maxLimit = Math.max(1, limit);

  if (profileEmbedding && profileEmbedding.length === 512) {
    const vectorStr = `[${profileEmbedding.join(",")}]`;

    // Calculate match score as a percentage: (1 - cosine_distance) * 100
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
        ((1 - (embedding <=> $1::vector)) * 100) as "matchScore"
      FROM "JobListing"
      WHERE "classificationStatus" = 'COMPLETED'
        AND ("postedAt" >= NOW() - $2 * INTERVAL '1 day' OR "postedAt" IS NULL)
      ORDER BY "matchScore" DESC
      LIMIT $3;
      `,
      vectorStr,
      days,
      maxLimit
    );
  } else {
    // Fallback: Return sorted by postedAt/createdAt descending, matchScore is null
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
        NULL as "matchScore"
      FROM "JobListing"
      WHERE "classificationStatus" = 'COMPLETED'
        AND ("postedAt" >= NOW() - $1 * INTERVAL '1 day' OR "postedAt" IS NULL)
      ORDER BY COALESCE("postedAt", "createdAt") DESC
      LIMIT $2;
      `,
      days,
      maxLimit
    );
  }
}
