import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { runDeepAnalysis } from "@/services/deepAnalysisService";
import { logger } from "@/lib/logging/logger";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cachedAnalysis = await prisma.jobAnalysis.findUnique({
      where: { jobId },
    });

    if (cachedAnalysis) {
      return NextResponse.json({ cached: true, analysis: cachedAnalysis });
    }

    return NextResponse.json({ cached: false });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch Job Listing
    const job = await prisma.jobListing.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        company: true,
        fullDescription: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job Listing not found" }, { status: 404 });
    }

    // 3. Check cache
    const cachedAnalysis = await prisma.jobAnalysis.findUnique({
      where: { jobId: job.id },
    });

    if (cachedAnalysis) {
      logger.info(`[DeepAnalysisAPI] Cache HIT for job: ${job.id}`);
      return NextResponse.json(cachedAnalysis);
    }

    logger.info(`[DeepAnalysisAPI] Cache MISS for job: ${job.id}. Performing LLM deep analysis...`);

    // 4. Fetch User Profile with all relevant relationships
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        skills: true,
        experiences: {
          orderBy: { startDate: "desc" },
        },
        education: {
          orderBy: { startDate: "desc" },
        },
        projects: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found. Please create a profile first." },
        { status: 400 }
      );
    }

    // 5. Run LLM deep analysis
    const analysis = await runDeepAnalysis(profile, job);

    // 6. Persist to cache
    const newAnalysis = await prisma.jobAnalysis.create({
      data: {
        jobId: job.id,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        missingSkills: analysis.missingSkills,
        verdict: analysis.verdict,
        justification: analysis.justification,
      },
    });

    return NextResponse.json(newAnalysis);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[DeepAnalysisAPI] Deep analysis failed", { error: errMsg });
    return NextResponse.json(
      { error: errMsg || "Internal Server Error" },
      { status: 500 }
    );
  }
}
