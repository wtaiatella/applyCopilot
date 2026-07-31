import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { CVReviewAllSchema } from "@/lib/validation/cvSchemas";
import {
  loadOwnedCV,
  buildCVJobContext,
  findSnapshotEntity,
} from "@/lib/db/cvEntityAccess";
import {
  runReviewAll,
  type BulletInput,
  type BulletSuggestion,
  type RelevanceDecision,
} from "@/services/profileBulletAIService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/ai/review-all — job-aware Review All over the CV's own snapshot
 * (FR-7, FR-8, AC.5). Stateless: never writes to the database.
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

    const parsed = CVReviewAllSchema.safeParse(body);
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

    const { entityType, entityId } = parsed.data;
    const snapshot = cv.snapshotData as unknown as CVSnapshotData;
    const entity = findSnapshotEntity(snapshot, entityType, entityId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bullets: BulletInput[] = entity.bullets.map((b) => ({
      id: b.id,
      text: b.text,
      type: b.type,
      usedInCVs: [],
    }));

    const jobContext = await buildCVJobContext(cv);

    const result = await runReviewAll({
      bullets,
      contextNotes: entity.freeFormContext,
      jobContext,
    });

    // Security guard (defense-in-depth): the AI is prompted to only reference bulletIds from
    // this CV's own snapshot, but never trust that blindly — drop any suggestion or relevance
    // decision whose id(s) are not a subset of the bullets we actually sent for this entity
    // (same guard already implemented in /api/profile/ai/review-all/route.ts).
    const ownBulletIds = new Set(bullets.map((b) => b.id));
    const suggestions: BulletSuggestion[] = result.suggestions.filter((s) => {
      if (s.type === "REWRITE") {
        if (!ownBulletIds.has(s.bulletId)) {
          logger.warn(
            "Dropping REWRITE suggestion: bulletId not in this CV's snapshot",
            { cvId, entityId, bulletId: s.bulletId },
          );
          return false;
        }
        return true;
      }
      if (s.type === "MERGE") {
        const allOwned = s.bulletIds.every((id) => ownBulletIds.has(id));
        if (!allOwned) {
          logger.warn(
            "Dropping MERGE suggestion: bulletId(s) not in this CV's snapshot",
            { cvId, entityId, bulletIds: s.bulletIds },
          );
          return false;
        }
        return true;
      }
      return true; // NEW suggestions don't reference existing bulletIds
    });

    const relevanceDecisions: RelevanceDecision[] | undefined =
      result.relevanceDecisions?.filter((d) => {
        if (!ownBulletIds.has(d.bulletId)) {
          logger.warn(
            "Dropping relevanceDecision: bulletId not in this CV's snapshot",
            { cvId, entityId, bulletId: d.bulletId },
          );
          return false;
        }
        return true;
      });

    logger.info("cv_ai_review_all", {
      cvId,
      entityType,
      entityId,
      bulletCount: bullets.length,
      hasJobContext: true,
      hasDeepAnalysis:
        Boolean(jobContext.weaknesses?.length) ||
        Boolean(jobContext.missingSkills?.length),
      suggestionCount: suggestions.length,
    });

    return NextResponse.json({
      suggestions,
      relevanceDecisions: relevanceDecisions ?? [],
    });
  } catch (error) {
    logger.error("Failed to run CV review-all", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
