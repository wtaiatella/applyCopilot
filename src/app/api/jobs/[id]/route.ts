import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/[id] — fetch one job listing (read-only glue for the CV Composer's
 * Job Description tab, T020). Job listings are shared/global (scraped, no per-user
 * ownership column), so only an authenticated session is required.
 */
export async function GET(_req: Request, props: Params) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await props.params;

    const job = await prisma.jobListing.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        url: true,
        fullDescription: true,
        isFullDescriptionFetched: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job listing not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    logger.error("Failed to fetch job listing", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
