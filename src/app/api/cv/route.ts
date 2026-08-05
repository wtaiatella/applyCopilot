import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { CreateCVSchema } from "@/lib/validation/cvSchemas";
import { buildSnapshotFromProfile } from "@/services/cvSnapshotService";

/**
 * POST /api/cv — idempotent create-or-get (FR-1, AC.1, AC.2, NFR "Concurrency").
 *
 * Checks for an existing row first (the common case — re-opening a job that already has a CV,
 * exercised on every Application Tracker card/row click since 009-aplication-tracker) and only
 * attempts `prisma.cV.create` when none is found. On a unique-constraint violation
 * (profileId+jobListingId, @@unique in schema) — the rare true concurrent-create race — catches
 * it and `findFirst`s the row a second time instead of failing, per Technical Decisions'
 * concurrency guarantee. This ordering avoids using an expected-and-caught exception as the
 * normal control flow for the by-far-most-common case, which otherwise logs a scary (but
 * harmless) Prisma error on every reopen of an existing CV.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateCVSchema.safeParse(body);
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

    const { jobListingId } = parsed.data;

    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      return NextResponse.json(
        { error: "No Profile to clone from" },
        { status: 400 },
      );
    }

    const jobListing = await prisma.jobListing.findUnique({
      where: { id: jobListingId },
    });
    if (!jobListing) {
      return NextResponse.json(
        { error: "Job listing not found" },
        { status: 404 },
      );
    }

    const alreadyExisting = await prisma.cV.findFirst({
      where: { profileId: profile.id, jobListingId },
    });
    if (alreadyExisting) {
      logger.info("cv_create_idempotent_hit", {
        profileId: profile.id,
        jobListingId,
        cvId: alreadyExisting.id,
      });
      return NextResponse.json(
        {
          id: alreadyExisting.id,
          jobListingId: alreadyExisting.jobListingId,
          status: alreadyExisting.status,
          appliedAt: alreadyExisting.appliedAt
            ? alreadyExisting.appliedAt.toISOString()
            : null,
          createdAt: alreadyExisting.createdAt.toISOString(),
        },
        { status: 200 },
      );
    }

    try {
      const snapshotData = await buildSnapshotFromProfile(profile.id);

      const newCV = await prisma.cV.create({
        data: {
          profileId: profile.id,
          jobListingId,
          name: jobListing.title,
          status: "DRAFT",
          snapshotData: snapshotData as unknown as Prisma.InputJsonValue,
        },
      });

      logger.info("cv_created", {
        profileId: profile.id,
        jobListingId,
        cvId: newCV.id,
      });

      return NextResponse.json(
        {
          id: newCV.id,
          jobListingId: newCV.jobListingId,
          status: newCV.status,
          appliedAt: newCV.appliedAt ? newCV.appliedAt.toISOString() : null,
          createdAt: newCV.createdAt.toISOString(),
        },
        { status: 201 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Already exists — a concurrent request won the race; fetch and return it (AC.2).
        const existing = await prisma.cV.findFirst({
          where: { profileId: profile.id, jobListingId },
        });

        if (existing) {
          logger.info("cv_create_idempotent_hit", {
            profileId: profile.id,
            jobListingId,
            cvId: existing.id,
          });
          return NextResponse.json(
            {
              id: existing.id,
              jobListingId: existing.jobListingId,
              status: existing.status,
              appliedAt: existing.appliedAt
                ? existing.appliedAt.toISOString()
                : null,
              createdAt: existing.createdAt.toISOString(),
            },
            { status: 200 },
          );
        }
      }
      throw err;
    }
  } catch (error) {
    logger.error("Failed to create CV", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
