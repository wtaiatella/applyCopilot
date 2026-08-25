import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

/**
 * Admin-triggered backfill for existing profiles/job listings that predate the canonical skill
 * vocabulary (FR-16, AC-7). Reuses the exact reset shape from
 * `src/app/api/admin/llm-config/route.ts:257-282` (the embedding-provider-change reset): eligible
 * `JobListing` rows go back to `PENDING` (attempts/error cleared) and eligible `UserProfile` rows
 * have `embeddingSyncedAt` cleared. No new job/worker is created here — the already-running
 * classification worker and user-triggered profile-sync pick these rows back up on their own.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [profileResetResult, jobsRequeuedResult] = await prisma.$transaction([
      prisma.userProfile.updateMany({
        where: { embeddingSyncedAt: { not: null } },
        data: { embeddingSyncedAt: null },
      }),
      prisma.jobListing.updateMany({
        where: { classificationStatus: "COMPLETED" },
        data: {
          classificationStatus: "PENDING",
          classificationAttempts: 0,
          classificationError: null,
        },
      }),
    ]);

    logger.warn("skill_vocabulary_backfill", {
      profilesReset: profileResetResult.count,
      jobsRequeued: jobsRequeuedResult.count,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      profilesReset: profileResetResult.count,
      jobsRequeued: jobsRequeuedResult.count,
    });
  } catch (error) {
    logger.error("Failed to run skill vocabulary backfill", { error });
    return NextResponse.json(
      { error: "Failed to run skill vocabulary backfill" },
      { status: 500 },
    );
  }
}
