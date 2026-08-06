import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { GenerateBulletSchema } from "@/lib/validation/aiSchemas";
import { loadOwnedEntity } from "@/lib/db/profileEntityAccess";
import {
  assertAiRateLimit,
  AiRateLimitExceededError,
} from "@/lib/ai/aiRateLimit";
import { runGenerateBullet } from "@/services/profileBulletAIService";

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

    const parsed = GenerateBulletSchema.safeParse(body);
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

    // Ownership check
    const entity = await loadOwnedEntity(entityType, entityId, userId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await assertAiRateLimit(userId, "profile_generate_bullet", 30);

    // Guard: AI Context Notes are required to generate a new bullet
    if (entity.freeFormContext.length === 0) {
      return NextResponse.json(
        { error: "AI_CONTEXT_REQUIRED" },
        { status: 400 },
      );
    }

    const existingBullets = entity.bullets.map((b) => b.text);

    const result = await runGenerateBullet({
      contextNotes: entity.freeFormContext,
      existingBullets,
      userComment,
    });

    logger.info("Generate-bullet completed", { entityType, entityId });

    return NextResponse.json({ text: result.revisedText });
  } catch (error) {
    if (error instanceof AiRateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    logger.error("Failed to run generate-bullet", { error });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    );
  }
}
