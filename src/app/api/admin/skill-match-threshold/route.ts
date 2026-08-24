import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { skillThresholdSchema } from "@/lib/validation/adminSchemas";

export const dynamic = "force-dynamic";

/** `SystemConfig` key for the matched/missing display-classification threshold (0-100 int,
 * default 72, FR-17) — mirrors `skillVectorLookupService.ts`'s `MATCH_DISPLAY_THRESHOLD_KEY`.
 * Deliberately a separate key/route from `skill-threshold` (`SKILL_ALIAS_SIMILARITY_THRESHOLD`,
 * default 60) — see that service's module doc for why the two gates need different values. */
const MATCH_DISPLAY_THRESHOLD_KEY = "SKILL_MATCH_DISPLAY_THRESHOLD";
const DEFAULT_MATCH_DISPLAY_THRESHOLD = "72";

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
      where: { key: MATCH_DISPLAY_THRESHOLD_KEY },
    });

    const threshold = parseInt(
      config?.value ?? DEFAULT_MATCH_DISPLAY_THRESHOLD,
      10,
    );

    return NextResponse.json({ threshold });
  } catch (error) {
    logger.error("Failed to load skill match display threshold", { error });
    return NextResponse.json(
      { error: "Failed to load skill match display threshold" },
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

    // Same no-reprocessing-side-effect contract as skill-threshold/route.ts (FR-15): only the
    // SystemConfig value changes, nothing else is touched or reprocessed here.
    await prisma.systemConfig.upsert({
      where: { key: MATCH_DISPLAY_THRESHOLD_KEY },
      create: { key: MATCH_DISPLAY_THRESHOLD_KEY, value: String(threshold) },
      update: { value: String(threshold) },
    });

    logger.info("Skill match display threshold updated by admin", {
      userId: session.user.id,
      email: session.user.email,
      threshold,
    });

    return NextResponse.json({ success: true, threshold });
  } catch (error) {
    logger.error("Failed to update skill match display threshold", { error });
    return NextResponse.json(
      { error: "Failed to update skill match display threshold" },
      { status: 500 },
    );
  }
}
