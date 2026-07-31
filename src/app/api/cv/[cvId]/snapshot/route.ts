import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SnapshotUpdateSchema } from "@/lib/validation/cvSchemas";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * PUT /api/cv/[cvId]/snapshot — autosave the whole snapshot blob (DRAFT-only, FR-4, AC.3, AC.11).
 *
 * `auth()` → ownership → 409 if `status === APPLIED` → Zod `SnapshotUpdateSchema` → whole-payload
 * replace (never partial write) → `logger.info("cv_snapshot_saved")`.
 */
export async function PUT(req: Request, props: Params) {
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

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = SnapshotUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      );
    }

    // Whole-payload replace — never a partial write. The `status: { not: "APPLIED" }` clause is
    // the actual enforcement (atomic re-check at write time); the pre-check above is only a
    // fast-path optimization and does not by itself close the TOCTOU window against a concurrent
    // `POST /apply` committing between the pre-read and this write.
    const result = await prisma.cV.updateMany({
      where: { id: cvId, status: { not: "APPLIED" } },
      data: { snapshotData: parsed.data as unknown as Prisma.InputJsonValue },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "CV is APPLIED (read-only)" },
        { status: 409 },
      );
    }

    const savedAt = new Date().toISOString();

    logger.info("cv_snapshot_saved", { cvId, profileId: cv.profileId });

    return NextResponse.json({ savedAt });
  } catch (error) {
    logger.error("Failed to save CV snapshot", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
