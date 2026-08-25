import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON, resolveAIConfig } from "@/lib/ai/aiClient";
import {
  withCircuitBreaker,
  isProviderBlocked,
  isBlockingHttpStatus,
  extractHttpStatus,
} from "@/lib/ai/circuit-breaker";
import { logger } from "@/lib/logging/logger";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";

const MAX_SUGGEST_PER_HOUR = 10;

/** Same SystemConfig key the admin panel's "Default" provider + its Reset-block button already
 * target (src/app/api/admin/llm-config/route.ts) — this route previously called `generateJSON`
 * directly with no circuit-breaker protection, so a 429 here kept getting re-hit on every
 * subsequent click with no cooldown (unlike the classification worker / skill canonicalization
 * write paths, which have been circuit-breaker-protected since earlier in this ticket). */
const DEFAULT_PROVIDER_KEY = "AI_PROVIDER_DEFAULT";

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
      where: {
        userId,
        action: "suggest_skills",
        createdAt: { gte: oneHourAgo },
      },
    });

    if (usageCount >= MAX_SUGGEST_PER_HOUR) {
      return NextResponse.json(
        {
          error: `Rate limit reached. You can only generate ${MAX_SUGGEST_PER_HOUR} skill suggestions per hour.`,
        },
        { status: 429 },
      );
    }

    // Fail fast if the "default" capability's currently-configured provider is already
    // circuit-broken (e.g. a recent 429 from Gemini) — avoids spending the DB reads below just
    // to hit the same rate limit again, and gives the user a clear, actionable message instead
    // of a generic 500 crash.
    const { provider: defaultProvider } = await resolveAIConfig("default");
    if (await isProviderBlocked(DEFAULT_PROVIDER_KEY, defaultProvider)) {
      return NextResponse.json(
        {
          error: `The AI provider (${defaultProvider}) is temporarily rate-limited. Please try again in a few minutes, or ask an admin to switch/reset the provider in Settings.`,
        },
        { status: 429 },
      );
    }

    // Load user's profile with all experiences (and their bullets) and projects
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        experiences: {
          include: {
            bullets: {
              where: { isArchived: false },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { startDate: "desc" },
        },
        projects: {
          include: {
            bullets: {
              where: { isArchived: false },
              orderBy: { sortOrder: "asc" },
            },
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
        {
          error:
            "No work experiences or projects found. Add them first so the AI can extract skills.",
        },
        { status: 422 },
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

    logger.info(
      `Extracting skills for user ${userId} based on ${profile.experiences.length} experiences and ${profile.projects.length} projects`,
    );

    const result = await withCircuitBreaker(
      DEFAULT_PROVIDER_KEY,
      defaultProvider,
      () => generateJSON<SuggestedSkillsResponse>(prompt, "default"),
    );

    const suggestedSkills = result.skills || [];

    if (suggestedSkills.length > 0) {
      await ProfileMergeService.mergeSkills(
        profile.id,
        suggestedSkills.map((s) => ({
          name: s.name,
          proficiency: "INTERMEDIATE",
        })),
      );
    }

    // Log usage
    await prisma.aIUsageLog.create({
      data: { userId, action: "suggest_skills" },
    });

    logger.info("Skills suggestions generated and merged successfully", {
      userId,
      count: suggestedSkills.length,
    });

    // Fetch the updated skills list to return
    const updatedSkills = await prisma.skill.findMany({
      where: { profileId: profile.id, isArchived: false },
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

    // Surface a clear, actionable message for a rate-limit/quota/auth failure instead of a
    // generic 500 — withCircuitBreaker above already recorded the block for next time.
    const statusCode = extractHttpStatus(error);
    if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
      return NextResponse.json(
        {
          error:
            "The AI provider is temporarily rate-limited or unavailable. Please try again in a few minutes.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate skills suggestions" },
      { status: 500 },
    );
  }
}
