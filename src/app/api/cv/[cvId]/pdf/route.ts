import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { renderCVToPdfBuffer } from "@/services/cvPdfService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/**
 * GET /api/cv/[cvId]/pdf — repeatable, no status change (FR-12, AC.7).
 *
 * Only ever reads the CV's own `snapshotData`; never mutates `status`/`snapshotData` (NFR
 * "Resilience" — Print PDF is repeatable at any time, distinct from the one-time Apply action).
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

    const snapshotData = cv.snapshotData as unknown as CVSnapshotData;
    const pdfBuffer = await renderCVToPdfBuffer(snapshotData);

    logger.info("cv_pdf_generated", { cvId });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cv-${cvId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("Failed to generate CV PDF", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
