import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * GET /api/cv/[cvId] — fetch one CV, ownership-checked (never leak existence — 404 if not owned).
 */
export async function GET(_req: Request, props: Params) {
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

    return NextResponse.json({
      id: cv.id,
      jobListingId: cv.jobListingId,
      status: cv.status,
      appliedAt: cv.appliedAt ? cv.appliedAt.toISOString() : null,
      snapshotData: cv.snapshotData as unknown as CVSnapshotData,
    });
  } catch (error) {
    logger.error("Failed to fetch CV", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
