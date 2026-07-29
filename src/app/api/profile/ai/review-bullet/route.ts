import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { ReviewBulletSchema } from "@/lib/validation/aiSchemas";
import { loadOwnedEntity } from "@/lib/db/profileEntityAccess";
import { runReviewBullet } from "@/services/profileBulletAIService";

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

    const parsed = ReviewBulletSchema.safeParse(body);
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

    // Ownership check of the parent entity
    const entity = await loadOwnedEntity(entityType, entityId, userId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify the bulletId belongs to this entity (never trust a caller-supplied bulletId in isolation)
    const bullet = entity.bullets.find((b) => b.id === bulletId);
    if (!bullet) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await runReviewBullet({
      bullet: {
        id: bullet.id,
        text: bullet.text,
        type: bullet.type,
        usedInCVs: bullet.usedInCVs,
      },
      contextNotes: entity.freeFormContext,
      userComment,
    });

    logger.info("Review-bullet completed", { entityType, entityId, bulletId });

    return NextResponse.json({ revisedText: result.revisedText });
  } catch (error) {
    logger.error("Failed to run review-bullet", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
