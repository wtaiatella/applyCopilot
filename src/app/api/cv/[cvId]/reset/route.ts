import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { buildSnapshotFromProfile } from "@/services/cvSnapshotService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/reset — discard and re-clone from the live Profile (FR-11, AC.4, DRAFT-only).
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

    if (cv.status === "APPLIED") {
      return NextResponse.json(
        { error: "CV is APPLIED (read-only)" },
        { status: 409 },
      );
    }

    const snapshotData: CVSnapshotData = await buildSnapshotFromProfile(
      cv.profileId,
    );

    // The `status: { not: "APPLIED" }` clause is the actual enforcement (atomic re-check at write
    // time); the pre-check above is only a fast-path optimization and does not by itself close
    // the TOCTOU window against a concurrent `POST /apply` committing between the pre-read and
    // this write.
    const result = await prisma.cV.updateMany({
      where: { id: cvId, status: { not: "APPLIED" } },
      data: { snapshotData: snapshotData as unknown as Prisma.InputJsonValue },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "CV is APPLIED (read-only)" },
        { status: 409 },
      );
    }

    logger.info("cv_reset", { cvId, profileId: cv.profileId });

    return NextResponse.json({ snapshotData });
  } catch (error) {
    logger.error("Failed to reset CV", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
