import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { getTrackerListRows } from "@/services/applicationTrackerListService";

/**
 * GET /api/application-tracker/list — consolidated List view read (FR-19, FR-20, AC.9).
 * Scoped to the caller's own `profileId` at the query level (Security Requirements) via
 * `applicationTrackerListService.getTrackerListRows`, which issues exactly one query
 * regardless of job count.
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
      return NextResponse.json({ rows: [] });
    }

    const rows = await getTrackerListRows(profile.id);

    logger.info("application_tracker_list_fetched", {
      profileId: profile.id,
      rowCount: rows.length,
    });

    return NextResponse.json({ rows });
  } catch (error) {
    logger.error("Failed to fetch application tracker list", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
