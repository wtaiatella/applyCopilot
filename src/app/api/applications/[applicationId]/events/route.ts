import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AddEventSchema } from "@/lib/validation/applicationSchemas";
import { addManualEvent } from "@/services/applicationService";

interface Params {
  params: Promise<{ applicationId: string }>;
}

/**
 * POST /api/applications/[applicationId]/events — manual timeline entry (FR-9, AC.5, AC.6).
 * Discriminated union by "type" (NOTE / MEETING / COMPANY_RESPONSE) — the same endpoint the
 * board's own detail modal and the per-job Application tab both call (spectech.md Technical
 * Decisions).
 */
export async function POST(req: Request, props: Params) {
  try {
    const { applicationId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify ownership — identical convention to `/api/applications/[applicationId]/stage`.
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

    const parsed = AddEventSchema.safeParse(body);
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

    const event = await addManualEvent(applicationId, parsed.data);

    return NextResponse.json(
      {
        id: event.id,
        type: event.type,
        content: event.content,
        title: event.title,
        eventAt: event.eventAt ? new Date(event.eventAt).toISOString() : null,
        createdAt: new Date(event.createdAt).toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Failed to add manual Application event", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
