import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { AIServiceUnavailableError } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";
import {
  BackfillInProgressError,
  runEmbeddingBackfill,
} from "@/services/embeddingBackfillService";

export const dynamic = "force-dynamic";

/**
 * Admin-triggered embedding-only backfill across SkillEmbedding, UserProfile,
 * and COMPLETED JobListing rows (reusing persisted jobFacts.mustHave).
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

    const counts = await runEmbeddingBackfill(session.user.id);

    return NextResponse.json({
      success: true,
      ...counts,
    });
  } catch (error) {
    if (error instanceof BackfillInProgressError) {
      return NextResponse.json(
        {
          error:
            error.message ||
            "A skill vocabulary and embedding backfill is already in progress.",
        },
        { status: 409 },
      );
    }
    if (error instanceof AIServiceUnavailableError) {
      logger.warn("AI service unavailable during skill vocabulary backfill", {
        error: error.message,
      });
      return NextResponse.json(
        {
          error:
            error.message ||
            "AI service temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }
    logger.error("Failed to run skill vocabulary backfill", { error });
    return NextResponse.json(
      { error: "Failed to run skill vocabulary backfill" },
      { status: 500 },
    );
  }
}
