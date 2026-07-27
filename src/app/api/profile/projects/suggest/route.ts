import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";

const MAX_SUGGEST_PER_DAY = 10;

interface SuggestedProject {
  name: string;
  technologies: string[];
  bullets: { text: string; type: "BULLET" | "PARAGRAPH" }[];
  freeFormContext: string[];
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limiting: 10 suggestions per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usageCount = await prisma.aIUsageLog.count({
      where: { userId, action: "suggest_project", createdAt: { gte: oneDayAgo } },
    });

    if (usageCount >= MAX_SUGGEST_PER_DAY) {
      return NextResponse.json(
        { error: `Rate limit reached. You can only generate ${MAX_SUGGEST_PER_DAY} project suggestions per day.` },
        { status: 429 }
      );
    }

    // Load user's experiences as context
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        experiences: {
          include: {
            bullets: { where: { isArchived: false }, orderBy: { sortOrder: "asc" } },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.experiences.length === 0) {
      return NextResponse.json(
        { error: "No work experiences found. Add your work history first so the AI can suggest a relevant project." },
        { status: 422 }
      );
    }

    // Build experience context for the prompt
    const experienceContext = profile.experiences
      .map((exp) => {
        const bullets = exp.bullets.map((b) => `  - ${b.text}`).join("\n");
        return `**${exp.position} at ${exp.company}** (${exp.startDate.getFullYear()}${exp.current ? " – Present" : exp.endDate ? ` – ${exp.endDate.getFullYear()}` : ""})\n${bullets}`;
      })
      .join("\n\n");

    const prompt = `You are a career advisor helping a software professional identify a strong project to highlight on their resume.

Based on the work experiences below, suggest ONE meaningful project, initiative, or technical achievement that could stand out on a portfolio or CV. It should be something that demonstrates technical depth, impact, or creativity — not just day-to-day tasks.

Work Experiences:
${experienceContext}

Return ONLY valid JSON matching this schema:
{
  "name": "string — concise project title (e.g. 'Real-time Analytics Pipeline', 'AI-Powered CV Generator')",
  "technologies": ["array of relevant technologies used"],
  "bullets": [
    { "text": "Achievement or description bullet (start with a strong action verb)", "type": "BULLET" }
  ],
  "freeFormContext": ["One sentence of context for the AI to use when generating CV content about this project"]
}

Requirements:
- name: short, professional, title-cased
- technologies: 3–8 items
- bullets: 3–5 items, each starting with an action verb, quantified where possible
- freeFormContext: 1 item, a brief note about the project's purpose and impact`;

    logger.info(`Suggesting project for user ${userId} based on ${profile.experiences.length} experiences`);

    const suggestion = await generateJSON<SuggestedProject>(prompt, "default");

    // Log usage
    await prisma.aIUsageLog.create({
      data: { userId, action: "suggest_project" },
    });

    logger.info("Project suggestion generated successfully", { userId });

    return NextResponse.json(suggestion);
  } catch (error) {
    logger.error("Failed to suggest project", { error });
    return NextResponse.json({ error: "Failed to generate project suggestion" }, { status: 500 });
  }
}
