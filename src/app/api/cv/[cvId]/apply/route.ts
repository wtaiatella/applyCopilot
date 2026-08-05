import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { reconcileCVApply } from "@/services/cvReconciliationService";
import { createApplicationForCV } from "@/services/applicationService";
import type { CVSnapshotData } from "@/types/cv";

interface Params {
  params: Promise<{ cvId: string }>;
}

/** Thrown when the atomic `DRAFT` → `APPLIED` guard inside the transaction finds the CV is
 * no longer `DRAFT` (already applied, or applied by a concurrent request) — causes a 409. */
class AlreadyAppliedError extends Error {
  constructor() {
    super("CV already APPLIED");
    this.name = "AlreadyAppliedError";
  }
}

/**
 * POST /api/cv/[cvId]/apply — freeze the CV (`status: APPLIED`, `appliedAt`) and trigger
 * reconciliation into the master Profile, one-time (FR-14–FR-18, AC.9, AC.11).
 *
 * Runs entirely inside one `prisma.$transaction`. The `DRAFT` → `APPLIED` status guard is the
 * FIRST statement inside the transaction, expressed as an atomic conditional `updateMany`
 * (`where: { id, status: "DRAFT" }`) — this closes a TOCTOU race where two concurrent apply
 * requests could both pass a pre-transaction `findUnique` check before either commits,
 * causing double reconciliation. If the guard's `count` is 0, the CV was already APPLIED (or
 * just got APPLIED by a racing request); we throw `AlreadyAppliedError` and the whole
 * transaction rolls back (no-op), surfaced as 409. `reconcileCVApply` then reconciles bullets,
 * summary, and skills (processing only `included` items, FR-15) using the already-known
 * cv/profileId; if reconciliation fails after the guard, the whole transaction — including the
 * status update — still rolls back, so DRAFT status is correctly restored on failure.
 */
export async function POST(_req: Request, props: Params) {
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

    const appliedAt = new Date();
    let applicationId: string;

    try {
      const application = await prisma.$transaction(
        async (tx) => {
          // Atomic conditional update — the FIRST statement in the transaction, closing the
          // TOCTOU window between a pre-transaction status check and the commit.
          const guard = await tx.cV.updateMany({
            where: { id: cvId, status: "DRAFT" },
            data: { status: "APPLIED", appliedAt },
          });
          if (guard.count === 0) {
            throw new AlreadyAppliedError();
          }

          await reconcileCVApply(
            // Structural subset needed by the reconciliation service — see cvReconciliationService.ts.
            tx as unknown as Parameters<typeof reconcileCVApply>[0],
            {
              id: cv.id,
              profileId: cv.profileId,
              snapshotData: cv.snapshotData as unknown as CVSnapshotData,
            },
          );

          // LAST statement in the transaction (see applicationService.ts, spectech's
          // Implementation Notes): a reconciliation failure above still rolls back cleanly with
          // no orphaned Application, since this hasn't run yet.
          return createApplicationForCV(
            tx as unknown as Parameters<typeof createApplicationForCV>[0],
            {
              id: cv.id,
              profileId: cv.profileId,
              jobListingId: cv.jobListingId,
            },
          );
        },
        { timeout: 10_000 },
      );
      applicationId = application.id;
    } catch (reconcileError) {
      if (reconcileError instanceof AlreadyAppliedError) {
        return NextResponse.json(
          { error: "CV already APPLIED" },
          { status: 409 },
        );
      }

      const err = reconcileError as { message?: string; code?: string };
      logger.error("cv_apply_failed", {
        cvId,
        errorMessage: err?.message,
        errorCode: err?.code,
      });
      return NextResponse.json(
        { error: "Snapshot failed validation, apply aborted" },
        { status: 422 },
      );
    }

    logger.info("cv_applied", { cvId, profileId: cv.profileId, applicationId });

    return NextResponse.json({
      id: cvId,
      status: "APPLIED",
      appliedAt: appliedAt.toISOString(),
      applicationId,
    });
  } catch (error) {
    logger.error("Failed to apply CV", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
