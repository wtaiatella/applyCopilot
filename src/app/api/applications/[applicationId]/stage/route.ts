import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { StageTransitionSchema } from "@/lib/validation/applicationSchemas";
import {
  transitionStage,
  OutcomeRequiredError,
} from "@/services/applicationService";

interface Params {
  params: Promise<{ applicationId: string }>;
}

/**
 * POST /api/applications/[applicationId]/stage — transition an Application's stage. Shared by
 * both the Kanban dropdown and drag-and-drop callers (FR-4–FR-6, AC.2, AC.4) — exactly one
 * server-side transition action, per spectech.md's Technical Decisions.
 */
export async function POST(req: Request, props: Params) {
  try {
    const { applicationId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify ownership — identical convention to `/api/cv/[cvId]/apply`.
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { profile: true },
    });

    if (!application || application.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Application not found or access denied" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = StageTransitionSchema.safeParse(body);
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

    let result;
    try {
      result = await transitionStage(applicationId, parsed.data);
    } catch (error) {
      if (error instanceof OutcomeRequiredError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [{ field: "outcome", message: error.message }],
          },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({
      id: result.application.id,
      stage: result.application.stage,
      outcome: result.application.outcome,
      eventId: result.eventId,
    });
  } catch (error) {
    logger.error("Failed to transition application stage", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
