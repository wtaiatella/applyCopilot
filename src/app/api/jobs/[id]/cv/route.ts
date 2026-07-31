import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/[id]/cv — status read-path for the sidebar hub (FR-19, AC.12).
 *
 * Scoped to the authenticated user's own Profile: no CV exists for this job → "not_started";
 * CV.status DRAFT → "draft"; CV.status APPLIED → "applied".
 */
export async function GET(_req: Request, props: Params) {
  try {
    const { id: jobListingId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      return NextResponse.json({ status: "not_started", cvId: null });
    }

    const cv = await prisma.cV.findFirst({
      where: { profileId: profile.id, jobListingId },
      select: { id: true, status: true },
    });

    if (!cv) {
      return NextResponse.json({ status: "not_started", cvId: null });
    }

    return NextResponse.json({
      status: cv.status === "APPLIED" ? "applied" : "draft",
      cvId: cv.id,
    });
  } catch (error) {
    logger.error("Failed to fetch CV status for job", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
