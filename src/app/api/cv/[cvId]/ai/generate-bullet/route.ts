import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { CVGenerateBulletSchema } from "@/lib/validation/cvSchemas";
import {
  loadOwnedCV,
  buildCVJobContext,
  findSnapshotEntity,
} from "@/lib/db/cvEntityAccess";
import { runGenerateBullet } from "@/services/profileBulletAIService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/ai/generate-bullet — job-aware "Add with AI" (FR-7). Stateless.
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

    const parsed = CVGenerateBulletSchema.safeParse(body);
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

    const { entityType, entityId, userComment } = parsed.data;
    const snapshot = cv.snapshotData as unknown as CVSnapshotData;
    const entity = findSnapshotEntity(snapshot, entityType, entityId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const jobContext = await buildCVJobContext(cv);

    // FR-7/AC.5: no longer blocked on "no context notes" alone — the job description (always
    // present via jobContext) is sufficient context for this CV-scoped action.
    if (entity.freeFormContext.length === 0 && !jobContext.jobDescription) {
      return NextResponse.json(
        { error: "AI_CONTEXT_REQUIRED" },
        { status: 400 },
      );
    }

    const result = await runGenerateBullet({
      contextNotes: entity.freeFormContext,
      existingBullets: entity.bullets.map((b) => b.text),
      userComment,
      jobContext,
    });

    logger.info("cv_ai_generate_bullet", { cvId, entityType, entityId });

    return NextResponse.json({ revisedText: result.revisedText });
  } catch (error) {
    logger.error("Failed to run CV generate-bullet", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
