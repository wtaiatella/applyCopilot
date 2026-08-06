import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { loadOwnedCV, buildCVJobContext } from "@/lib/db/cvEntityAccess";
import {
  assertAiRateLimit,
  AiRateLimitExceededError,
} from "@/lib/ai/aiRateLimit";
import { runGenerateSummary } from "@/services/profileBulletAIService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * POST /api/cv/[cvId]/ai/generate-summary — job-aware Basic Data summary (FR-9). Stateless;
 * no request body fields — uses this CV's own snapshot experiences + job context.
 */
export async function POST(_req: Request, props: Params) {
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

    await assertAiRateLimit(userId, "cv_generate_summary", 20);

    const snapshot = cv.snapshotData as unknown as CVSnapshotData;
    const jobContext = await buildCVJobContext(cv);

    const result = await runGenerateSummary({
      jobContext,
      experiences: snapshot.experiences.map((e) => ({
        company: e.company,
        position: e.position,
        bulletTexts: e.bullets.map((b) => b.text),
      })),
      existingSummaries: snapshot.summaries.map((s) => s.content),
    });

    logger.info("cv_ai_generate_summary", {
      cvId,
      experienceCount: snapshot.experiences.length,
      hasDeepAnalysis:
        Boolean(jobContext.weaknesses?.length) ||
        Boolean(jobContext.missingSkills?.length),
    });

    return NextResponse.json({ content: result.content });
  } catch (error) {
    if (error instanceof AiRateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    logger.error("Failed to run CV generate-summary", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
