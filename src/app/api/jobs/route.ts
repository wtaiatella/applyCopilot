import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getJobsWithSimilarity } from "@/lib/db/job-query";
import { logger } from "@/lib/logging/logger";

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
    // API Contracts).
    const limit = Math.min(100, Math.max(1, rawLimit));
    const minMatch = minMatchVal ? parseFloat(minMatchVal) : null;

    // Load User Profile embedding via raw query because Unsupported type is omitted by standard prisma client selectors
    const profileResult = await prisma.$queryRaw<any[]>`
      SELECT embedding::text FROM "UserProfile" WHERE "userId" = ${userId} LIMIT 1
    `;

    let profileEmbedding: number[] | null = null;
    const dbVectorStr = profileResult[0]?.embedding;
    if (dbVectorStr) {
      try {
        profileEmbedding = JSON.parse(dbVectorStr);
      } catch (err) {
        logger.error("Failed to parse user profile embedding vector from DB", {
          err,
        });
      }
    }

    // Retrieve and rank jobs
    let jobs = await getJobsWithSimilarity(profileEmbedding, days, limit);

    // Apply minMatch filter if specified and matchScore is calculated
    if (minMatch !== null && !isNaN(minMatch)) {
      jobs = jobs.filter(
        (job) => job.matchScore === null || job.matchScore >= minMatch,
      );
    }

    // One additional batched JobFavorite lookup (not per-row) merged into the ranked-jobs
    // response — two total queries for the whole page load, not one per job (US-7, FR-17).
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    let favoritedJobIds = new Set<string>();
    if (profile && jobs.length > 0) {
      const favorites = await prisma.jobFavorite.findMany({
        where: {
          profileId: profile.id,
          jobListingId: { in: jobs.map((job) => job.id) },
        },
        select: { jobListingId: true },
      });
      favoritedJobIds = new Set(favorites.map((f) => f.jobListingId));
    }

    const jobsWithFavorite = jobs.map((job) => ({
      ...job,
      favorite: favoritedJobIds.has(job.id),
    }));

    return NextResponse.json(jobsWithFavorite);
  } catch (error) {
    logger.error("Error fetching ranked jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
