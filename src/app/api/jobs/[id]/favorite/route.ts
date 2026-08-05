import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { FavoriteSchema } from "@/lib/validation/applicationSchemas";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/jobs/[id]/favorite — idempotent per-profile Favorite set (FR-17, FR-18, AC.8).
 *
 * `JobListing` is shared/global, so this route never requires ownership of it — only the
 * `JobFavorite` row it writes is scoped to the caller's own `profileId` (Security
 * Requirements), always written/read through `{ profileId, jobListingId }`.
 */
export async function PUT(req: Request, props: Params) {
  try {
    const { id: jobListingId } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const job = await prisma.jobListing.findUnique({
      where: { id: jobListingId },
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json(
        { error: "Job listing not found" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = FavoriteSchema.safeParse(body);
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

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found. Please create a profile first." },
        { status: 400 },
      );
    }

    const profileId = profile.id;
    const { favorite } = parsed.data;

    if (favorite) {
      // Idempotent set: no-op if already favorited (unique on [profileId, jobListingId]).
      await prisma.jobFavorite.upsert({
        where: { profileId_jobListingId: { profileId, jobListingId } },
        create: { profileId, jobListingId },
        update: {},
      });
      logger.info("job_favorited", { profileId, jobListingId });
    } else {
      // Idempotent unset: no-op if no row exists.
      await prisma.jobFavorite.deleteMany({
        where: { profileId, jobListingId },
      });
      logger.info("job_unfavorited", { profileId, jobListingId });
    }

    return NextResponse.json({ jobListingId, favorite });
  } catch (error) {
    logger.error("Failed to set job favorite", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
