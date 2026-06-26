import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";

const MAX_SUGGEST_PER_HOUR = 10;

interface SuggestedSkill {
  name: string;
}

interface SuggestedSkillsResponse {
  skills: SuggestedSkill[];
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limiting: 10 suggestions per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const usageCount = await prisma.aIUsageLog.count({
      where: { userId, action: "suggest_skills", createdAt: { gte: oneHourAgo } },
    });

    if (usageCount >= MAX_SUGGEST_PER_HOUR) {
      return NextResponse.json(
        { error: `Rate limit reached. You can only generate ${MAX_SUGGEST_PER_HOUR} skill suggestions per hour.` },
        { status: 429 }
      );
    }

    // Load user's profile with all experiences (and their bullets) and projects
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        experiences: {
          include: {
            bullets: { where: { isArchived: false }, orderBy: { sortOrder: "asc" } },
          },
          orderBy: { startDate: "desc" },
        },
        projects: {
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

    if (profile.experiences.length === 0 && profile.projects.length === 0) {
      return NextResponse.json(
        { error: "No work experiences or projects found. Add them first so the AI can extract skills." },
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

    // Build project context for the prompt
    const projectContext = profile.projects
      .map((proj) => {
        const bullets = proj.bullets.map((b) => `  - ${b.text}`).join("\n");
        const techs = proj.technologies.join(", ");
        return `**${proj.name}** (Technologies: ${techs})\n${bullets}`;
      })
      .join("\n\n");

    const prompt = `You are an expert resume parser and career advisor.
Based on the candidate's work experiences and projects below, extract a comprehensive list of technical and professional skills, tools, frameworks, and methodologies mentioned or demonstrated in their history.

Work Experiences:
${experienceContext}

Projects:
${projectContext}

Return ONLY valid JSON matching this schema:
{
  "skills": [
    { "name": "string — name of the skill (e.g. 'React', 'TypeScript', 'Agile Methodologies', 'Docker')" }
  ]
}

Requirements:
- Extract specific technical skills, tools, languages, frameworks, libraries, databases, cloud providers, and key methodologies/practices.
- Avoid generic soft skills like "team player" or "problem solving".
- Capitalize skill names correctly (e.g., "JavaScript" instead of "javascript", "SQL" instead of "sql", "React" instead of "reactjs").
- Return up to 20 relevant skills.`;

    logger.info(`Extracting skills for user ${userId} based on ${profile.experiences.length} experiences and ${profile.projects.length} projects`);

    const result = await generateJSON<SuggestedSkillsResponse>(prompt, "default");

    const suggestedSkills = result.skills || [];

    if (suggestedSkills.length > 0) {
      await ProfileMergeService.mergeSkills(
        profile.id,
        suggestedSkills.map((s) => ({
          name: s.name,
          proficiency: "INTERMEDIATE",
        }))
      );
    }

    // Log usage
    await prisma.aIUsageLog.create({
      data: { userId, action: "suggest_skills" },
    });

    logger.info("Skills suggestions generated and merged successfully", { userId, count: suggestedSkills.length });

    // Fetch the updated skills list to return
    const updatedSkills = await prisma.skill.findMany({
      where: { profileId: profile.id },
    });

    const responseData = updatedSkills.map((s) => ({
      id: s.id,
      name: s.name,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    }));

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to suggest skills", { error });
    return NextResponse.json({ error: "Failed to generate skills suggestions" }, { status: 500 });
  }
}
