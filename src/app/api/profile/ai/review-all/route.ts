import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { ReviewAllSchema } from "@/lib/validation/aiSchemas";
import { loadOwnedEntity } from "@/lib/db/profileEntityAccess";
import {
  runReviewAll,
  type BulletInput,
  type BulletSuggestion,
} from "@/services/profileBulletAIService";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ReviewAllSchema.safeParse(body);
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

    // Ownership check
    const entity = await loadOwnedEntity(entityType, entityId, userId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bullets: BulletInput[] = entity.bullets.map((b) => ({
      id: b.id,
      text: b.text,
      type: b.type,
      usedInCVs: b.usedInCVs,
    }));

    const result = await runReviewAll({
      bullets,
      contextNotes: entity.freeFormContext,
    });

    // Security guard: the AI is prompted to only reference bulletIds from the input,
    // but never trust that blindly — drop any suggestion whose bulletId(s) are not a
    // subset of the bullets we actually sent for this entity.
    const ownBulletIds = new Set(bullets.map((b) => b.id));
    const suggestions: BulletSuggestion[] = result.suggestions.filter((s) => {
      if (s.type === "REWRITE") {
        if (!ownBulletIds.has(s.bulletId)) {
          logger.warn(
            "Dropping REWRITE suggestion: bulletId not in caller's own input",
            {
              entityId,
              bulletId: s.bulletId,
            },
          );
          return false;
        }
        return true;
      }
      if (s.type === "MERGE") {
        const allOwned = s.bulletIds.every((id) => ownBulletIds.has(id));
        if (!allOwned) {
          logger.warn(
            "Dropping MERGE suggestion: bulletId(s) not in caller's own input",
            {
              entityId,
              bulletIds: s.bulletIds,
            },
          );
          return false;
        }
        return true;
      }
      return true; // NEW suggestions don't reference existing bulletIds
    });

    logger.info("Review-all completed", {
      entityType,
      entityId,
      suggestionCount: suggestions.length,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error("Failed to run review-all", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
