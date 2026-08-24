import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { skillThresholdSchema } from "@/lib/validation/adminSchemas";

export const dynamic = "force-dynamic";

/** `SystemConfig` key for the alias-confirmation similarity threshold (0-100 int, default 60,
 * FR-13) — mirrors `skillCanonicalizationService.ts`'s `SIMILARITY_THRESHOLD_KEY`. */
const SIMILARITY_THRESHOLD_KEY = "SKILL_ALIAS_SIMILARITY_THRESHOLD";
const DEFAULT_SIMILARITY_THRESHOLD = "60";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: SIMILARITY_THRESHOLD_KEY },
    });

    const threshold = parseInt(
      config?.value ?? DEFAULT_SIMILARITY_THRESHOLD,
      10,
    );

    return NextResponse.json({ threshold });
  } catch (error) {
    logger.error("Failed to load skill threshold", { error });
    return NextResponse.json(
      { error: "Failed to load skill threshold" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = skillThresholdSchema.safeParse(body);
    if (!result.success) {
      const details = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      );
    }

    const { threshold } = result.data;

    // Persist the new threshold only — this endpoint intentionally has no reprocessing
    // side effect (FR-15): existing SkillEmbedding/SkillAlias rows are never touched here,
    // unlike llm-config/route.ts's embedding-provider-change reset.
    await prisma.systemConfig.upsert({
      where: { key: SIMILARITY_THRESHOLD_KEY },
      create: { key: SIMILARITY_THRESHOLD_KEY, value: String(threshold) },
      update: { value: String(threshold) },
    });

    logger.info("Skill alias similarity threshold updated by admin", {
      userId: session.user.id,
      email: session.user.email,
      threshold,
    });

    return NextResponse.json({ success: true, threshold });
  } catch (error) {
    logger.error("Failed to update skill threshold", { error });
    return NextResponse.json(
      { error: "Failed to update skill threshold" },
      { status: 500 },
    );
  }
}
