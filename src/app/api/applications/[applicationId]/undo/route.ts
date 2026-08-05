import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { UndoSchema } from "@/lib/validation/applicationSchemas";
import { undoTransition, StaleUndoError } from "@/services/applicationService";

interface Params {
  params: Promise<{ applicationId: string }>;
}

/**
 * POST /api/applications/[applicationId]/undo — revert the most recent stage transition (FR-8,
 * AC.3). Rejects with 409 when `eventId` is not the Application's current latest `STAGE_CHANGE`
 * event (superseded, or already undone).
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

    const parsed = UndoSchema.safeParse(body);
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

    let updated;
    try {
      updated = await undoTransition(applicationId, parsed.data.eventId);
    } catch (error) {
      if (error instanceof StaleUndoError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({
      id: updated.id,
      stage: updated.stage,
      outcome: updated.outcome,
    });
  } catch (error) {
    logger.error("Failed to undo application transition", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
