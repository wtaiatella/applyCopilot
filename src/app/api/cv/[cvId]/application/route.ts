import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type { ApplicationEventDTO } from "@/types/application";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * GET /api/cv/[cvId]/application — Tab 5 read (FR-12). Keyed by `cvId` (the id `CVComposerContext`
 * already has) rather than `applicationId` — see spectech.md Technical Decisions ("two id
 * spaces"). The response includes `applicationId` so `ApplicationTab.tsx`'s own manual-entry
 * POSTs can hit `/api/applications/[applicationId]/events` directly, without a second lookup.
 */
export async function GET(_req: Request, props: Params) {
  try {
    const { cvId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const cv = await prisma.cV.findUnique({
      where: { id: cvId },
      include: { profile: true },
    });

    if (!cv || cv.profile.userId !== userId) {
      return NextResponse.json(
        { error: "CV not found or access denied" },
        { status: 404 },
      );
    }

    const application = await prisma.application.findUnique({
      where: { cvId },
      include: {
        events: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!application) {
      // CV exists and is owned, but is still DRAFT — not an error page, rendered as an empty
      // state by `ApplicationTab.tsx` (Error Handling Strategy).
      return NextResponse.json(
        { error: "No Application yet for this CV" },
        { status: 404 },
      );
    }

    const events: ApplicationEventDTO[] = application.events.map((event) => ({
      id: event.id,
      type: event.type,
      fromStage: event.fromStage,
      toStage: event.toStage,
      title: event.title,
      eventAt: event.eventAt ? event.eventAt.toISOString() : null,
      content: event.content,
      createdAt: event.createdAt.toISOString(),
    }));

    return NextResponse.json({
      application: {
        id: application.id,
        jobListingId: application.jobListingId,
        stage: application.stage,
        outcome: application.outcome,
        createdAt: application.createdAt.toISOString(),
      },
      events,
    });
  } catch (error) {
    logger.error("Failed to fetch Application for CV", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
