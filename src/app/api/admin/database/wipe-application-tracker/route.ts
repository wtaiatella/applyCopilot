import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/database/wipe-application-tracker
 *
 * ADMIN-only endpoint. Unlinks all jobs from the Application Tracker for the
 * currently authenticated user:
 * - Deletes ApplicationEvents and Applications
 * - Deletes CVBullets (releasing all bullets/skills/summaries marked as in-use) and CVs
 * - Deletes JobFavorites and JobAnalyses
 *
 * Preserves User, UserProfile (experiences, projects, education, skills, summaries,
 * including any archived/soft-deleted items), and global JobListing records.
 */
export async function POST() {
  try {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden — ADMIN role required" },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!userProfile) {
      return NextResponse.json(
        { error: "No profile found for this user — nothing to wipe." },
        { status: 404 }
      );
    }

    const profileId = userProfile.id;

    logger.warn(
      `[ADMIN] Starting application tracker wipe for userId=${userId} profileId=${profileId}`
    );

    const summary = await prisma.$transaction(async (tx) => {
      const counts: Record<string, number> = {};

      // 1. ApplicationEvents & Applications
      const applicationIds = (
        await tx.application.findMany({
          where: { profileId },
          select: { id: true },
        })
      ).map((app) => app.id);

      if (applicationIds.length > 0) {
        const eventDel = await tx.applicationEvent.deleteMany({
          where: { applicationId: { in: applicationIds } },
        });
        counts["ApplicationEvents"] = eventDel.count;
      } else {
        counts["ApplicationEvents"] = 0;
      }

      const appDel = await tx.application.deleteMany({
        where: { profileId },
      });
      counts["Applications"] = appDel.count;

      // 2. CVBullets (releases bullets/skills/summaries marked as in-use) & CVs
      const cvIds = (
        await tx.cV.findMany({
          where: { profileId },
          select: { id: true },
        })
      ).map((cv) => cv.id);

      if (cvIds.length > 0) {
        const cvBulletDel = await tx.cVBullet.deleteMany({
          where: { cvId: { in: cvIds } },
        });
        counts["CVBullets"] = cvBulletDel.count;
      } else {
        counts["CVBullets"] = 0;
      }

      const cvDel = await tx.cV.deleteMany({
        where: { profileId },
      });
      counts["CVs"] = cvDel.count;

      // 3. JobFavorites & JobAnalyses
      const favDel = await tx.jobFavorite.deleteMany({
        where: { profileId },
      });
      counts["JobFavorites"] = favDel.count;

      const analysisDel = await tx.jobAnalysis.deleteMany({
        where: { profileId },
      });
      counts["JobAnalyses"] = analysisDel.count;

      return counts;
    });

    logger.warn(
      `[ADMIN] Application tracker wipe completed for userId=${userId}`,
      { summary }
    );

    return NextResponse.json({
      ok: true,
      message:
        "Application tracker data wiped successfully. Profile and job listings preserved.",
      summary,
    });
  } catch (error) {
    const err = error as Error;
    logger.error("[ADMIN] Failed to wipe application tracker data", {
      error: err.message,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
