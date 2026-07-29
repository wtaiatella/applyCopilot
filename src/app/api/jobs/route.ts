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
    const limit = limitVal ? parseInt(limitVal, 10) : 50;
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
        logger.error("Failed to parse user profile embedding vector from DB", { err });
      }
    }

    // Retrieve and rank jobs
    let jobs = await getJobsWithSimilarity(profileEmbedding, days, limit);

    // Apply minMatch filter if specified and matchScore is calculated
    if (minMatch !== null && !isNaN(minMatch)) {
      jobs = jobs.filter((job) => job.matchScore === null || job.matchScore >= minMatch);
    }

    return NextResponse.json(jobs);
  } catch (error) {
    logger.error("Error fetching ranked jobs", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
