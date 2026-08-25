import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Rate limiting check (max 10 requests per user per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const summaryCount = await prisma.aIUsageLog.count({
      where: {
        userId,
        action: "summary",
        createdAt: { gte: oneHourAgo },
      },
    });

    if (summaryCount >= 10) {
      logger.warn(`User ${userId} hit summary AI generation rate limit`, {
        summaryCount,
      });
      return NextResponse.json(
        {
          error:
            "Rate limit reached. You can only generate 10 summaries per hour.",
        },
        { status: 429 },
      );
    }

    // 3. Parse request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { instructions, tone } = body;
    if (!tone) {
      return NextResponse.json({ error: "Tone is required" }, { status: 400 });
    }

    // 4. Fetch the complete profile of the user
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        experiences: {
          include: { bullets: { orderBy: { sortOrder: "asc" } } },
        },
        education: {
          include: { bullets: { orderBy: { sortOrder: "asc" } } },
        },
        projects: {
          include: { bullets: { orderBy: { sortOrder: "asc" } } },
        },
        skills: { where: { isArchived: false } },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 5. Build context-rich prompt
    const expText = profile.experiences
      .map(
        (exp) =>
          `- ${exp.position} at ${exp.company} (${exp.startDate.toISOString().split("T")[0]} to ${
            exp.endDate ? exp.endDate.toISOString().split("T")[0] : "Present"
          }):\n  ${exp.bullets.map((b) => `* ${b.text}`).join("\n  ")}`,
      )
      .join("\n\n");

    const projText = profile.projects
      .map(
        (proj) =>
          `- Project ${proj.name} (Tech: ${proj.technologies.join(", ")}):\n  ${proj.bullets
            .map((b) => `* ${b.text}`)
            .join("\n  ")}`,
      )
      .join("\n\n");

    const skillsText = profile.skills
      .map((s) => `${s.name} (${s.proficiency})`)
      .join(", ");

    const eduText = profile.education
      .map(
        (edu) =>
          `- ${edu.degree} in ${edu.fieldOfStudy || "N/A"} from ${edu.institution} (${
            edu.startDate.toISOString().split("T")[0]
          } to ${edu.endDate ? edu.endDate.toISOString().split("T")[0] : "Present"})`,
      )
      .join("\n\n");

    const prompt = `You are an expert resume writer and career coach. Review the user's professional profile below and draft a compelling profile summary.
The summary must adapt to the requested tone and instructions.

Target Tone: ${tone}
User Instructions: ${instructions || "None provided"}

Profile Details:
First Name: ${profile.firstName || ""}
Last Name: ${profile.lastName || ""}
Title: ${profile.title || ""}

Work Experience:
${expText || "None listed"}

Projects:
${projText || "None listed"}

Skills:
${skillsText || "None listed"}

Education:
${eduText || "None listed"}

Return ONLY a valid JSON object matching the following structure (no other text, no markdown wraps):
{
  "title": "A short, professional title (e.g. Senior Full Stack Engineer)",
  "content": "A paragraph summary summarizing their career highlights, skills, and value proposition."
}`;

    // 6. Call LLM
    const generated = await generateJSON<{ title: string; content: string }>(
      prompt,
      "summaries",
    );

    // 7. Log usage
    await prisma.aIUsageLog.create({
      data: {
        userId,
        action: "summary",
      },
    });

    logger.info("AI Summary generated successfully", { userId, tone });

    return NextResponse.json(generated);
  } catch (error) {
    const err = error as Error;
    logger.error("Failed to generate AI summary", { error: err.message });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
