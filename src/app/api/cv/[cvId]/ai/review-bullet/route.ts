import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { CVReviewBulletSchema } from "@/lib/validation/cvSchemas";
import {
  loadOwnedCV,
  buildCVJobContext,
  findSnapshotEntity,
} from "@/lib/db/cvEntityAccess";
import {
  runReviewBullet,
  type BulletInput,
} from "@/services/profileBulletAIService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/ai/review-bullet — job-aware per-bullet Review (FR-7). Stateless.
 */
export async function POST(req: Request, props: Params) {
  try {
    const { cvId } = await props.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const cv = await loadOwnedCV(cvId, userId);
    if (!cv) {
      return NextResponse.json(
        { error: "CV not found or access denied" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CVReviewBulletSchema.safeParse(body);
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

    const { entityType, entityId, bulletId, userComment } = parsed.data;
    const snapshot = cv.snapshotData as unknown as CVSnapshotData;
    const entity = findSnapshotEntity(snapshot, entityType, entityId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const targetBullet = entity.bullets.find((b) => b.id === bulletId);
    if (!targetBullet) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bullet: BulletInput = {
      id: targetBullet.id,
      text: targetBullet.text,
      type: targetBullet.type,
      usedInCVs: [],
    };

    const jobContext = await buildCVJobContext(cv);

    const result = await runReviewBullet({
      bullet,
      contextNotes: entity.freeFormContext,
      userComment,
      jobContext,
    });

    logger.info("cv_ai_review_bullet", {
      cvId,
      entityType,
      entityId,
      bulletId,
    });

    return NextResponse.json({ revisedText: result.revisedText });
  } catch (error) {
    logger.error("Failed to run CV review-bullet", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
