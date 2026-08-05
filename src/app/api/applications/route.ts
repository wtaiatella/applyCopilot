import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type { ApplicationBoardRow } from "@/types/application";

/**
 * GET /api/applications — Kanban board read (FR-14, FR-15), scoped to the caller's own
 * `profileId` at the query level (Security Requirements). Naturally restricted to jobs with an
 * `Application` row — favorited/analyzed-only jobs with no Application never appear here (the
 * backfill migration, T005, ensures pre-existing `007`-era APPLIED CVs still do).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json({ applications: [] });
    }

    const rows = await prisma.application.findMany({
      where: { profileId: profile.id },
      select: {
        id: true,
        jobListingId: true,
        stage: true,
        outcome: true,
        updatedAt: true,
        jobListing: { select: { title: true, company: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const applications: ApplicationBoardRow[] = rows.map((row) => ({
      id: row.id,
      jobListingId: row.jobListingId,
      jobTitle: row.jobListing.title,
      company: row.jobListing.company,
      stage: row.stage,
      outcome: row.outcome,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json({ applications });
  } catch (error) {
    logger.error("Failed to fetch applications board", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
