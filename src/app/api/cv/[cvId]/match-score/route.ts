import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { calculateCVMatchScore } from "@/services/cvMatchScoreService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/match-score — on-demand only (FR-13, AC.8).
 *
 * Strictly on-demand: this route is only ever invoked by an explicit button click from
 * `CVViewer.tsx`. It is never called automatically by autosave/snapshot edits, and never
 * touches `snapshotData`/`status` (NFR "Resilience").
 */
export async function POST(_req: Request, props: Params) {
  try {
    const { cvId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const cv = await prisma.cV.findUnique({
      where: { id: cvId },
      include: { profile: true },
    });

    if (!cv || cv.profile.userId !== userId) {
      return NextResponse.json(
        { error: "CV not found or access denied" },
        { status: 404 },
      );
    }

    const snapshotData = cv.snapshotData as unknown as CVSnapshotData;
    const score = await calculateCVMatchScore(snapshotData, cv.jobListingId);
    const computedAt = new Date().toISOString();

    logger.info("cv_match_score_calculated", { cvId, score });

    return NextResponse.json({ score, computedAt });
  } catch (error) {
    logger.error("Failed to calculate CV match score", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
