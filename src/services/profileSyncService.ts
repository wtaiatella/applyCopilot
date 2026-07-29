import { prisma } from "../lib/db/prisma";
import { generateText } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";

export interface ProfileData {
  id: string;
  title: string | null;
  summary: string | null;
  experiences: Array<{
    company: string;
    position: string;
    startDate: Date;
    endDate: Date | null;
    current: boolean;
    freeFormContext: string[];
    bullets: Array<{ text: string; isActive: boolean; isArchived: boolean }>;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string | null;
    startDate: Date;
    endDate: Date | null;
    current: boolean;
    bullets: Array<{ text: string; isActive: boolean; isArchived: boolean }>;
  }>;
  projects: Array<{
    name: string;
    technologies: string[];
    freeFormContext: string[];
    bullets: Array<{ text: string; isActive: boolean; isArchived: boolean }>;
  }>;
  skills: Array<{
    name: string;
    proficiency: string;
    yearsExperience: number | null;
  }>;
}

/**
 * Fetches the user profile and all associated relation models from the database.
 */
export async function fetchUserProfileData(userId: string): Promise<ProfileData | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: {
      experiences: {
        include: {
          bullets: true,
        },
      },
      education: {
        include: {
          bullets: true,
        },
      },
      projects: {
        include: {
          bullets: true,
        },
      },
      skills: true,
    },
  });

  return profile as unknown as ProfileData | null;
}

/**
 * Checks if the user profile contains at least one professional experience, education record, or skill.
 */
export function isProfileEmpty(profile: ProfileData): boolean {
  const hasExperience = profile.experiences.length > 0;
  const hasEducation = profile.education.length > 0;
  const hasSkills = profile.skills.length > 0;
  const hasProjects = profile.projects.length > 0;

  return !hasExperience && !hasEducation && !hasSkills && !hasProjects;
}

/**
 * Consolidates user profile information into a structured text document.
 */
export function consolidateProfileToText(profile: ProfileData): string {
  const parts: string[] = [];

  if (profile.title) parts.push(`Professional Title: ${profile.title}`);
  if (profile.summary) parts.push(`Professional Summary: ${profile.summary}`);

  // Skills
  if (profile.skills.length > 0) {
    parts.push("\nCore Skills & Technologies:");
    profile.skills.forEach((s) => {
      const exp = s.yearsExperience ? ` (${s.yearsExperience} years exp)` : "";
      parts.push(`- ${s.name}: Level ${s.proficiency}${exp}`);
    });
  }

  // Experience
  if (profile.experiences.length > 0) {
    parts.push("\nProfessional Experience:");
    profile.experiences.forEach((exp) => {
      const dateRange = `${exp.startDate.getFullYear()} - ${
        exp.current || !exp.endDate ? "Present" : exp.endDate.getFullYear()
      }`;
      parts.push(`- ${exp.position} at ${exp.company} (${dateRange}):`);
      
      // Active non-archived bullets
      const activeBullets = exp.bullets.filter((b) => b.isActive && !b.isArchived);
      activeBullets.forEach((bullet) => {
        parts.push(`  * ${bullet.text}`);
      });

      // Free form context notes
      if (exp.freeFormContext && exp.freeFormContext.length > 0) {
        exp.freeFormContext.forEach((note) => {
          parts.push(`  * Context: ${note}`);
        });
      }
    });
  }

  // Education
  if (profile.education.length > 0) {
    parts.push("\nEducation & Training:");
    profile.education.forEach((edu) => {
      const dateRange = `${edu.startDate.getFullYear()} - ${
        edu.current || !edu.endDate ? "Present" : edu.endDate.getFullYear()
      }`;
      const field = edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : "";
      parts.push(`- ${edu.degree}${field} at ${edu.institution} (${dateRange})`);
      
      const activeBullets = edu.bullets.filter((b) => b.isActive && !b.isArchived);
      activeBullets.forEach((bullet) => {
        parts.push(`  * ${bullet.text}`);
      });
    });
  }

  // Projects
  if (profile.projects.length > 0) {
    parts.push("\nKey Projects:");
    profile.projects.forEach((proj) => {
      const tech = proj.technologies.length > 0 ? ` (Technologies: ${proj.technologies.join(", ")})` : "";
      parts.push(`- Project: ${proj.name}${tech}`);
      
      const activeBullets = proj.bullets.filter((b) => b.isActive && !b.isArchived);
      activeBullets.forEach((bullet) => {
        parts.push(`  * ${bullet.text}`);
      });

      if (proj.freeFormContext && proj.freeFormContext.length > 0) {
        proj.freeFormContext.forEach((note) => {
          parts.push(`  * Context: ${note}`);
        });
      }
    });
  }

  return parts.join("\n").trim();
}

/**
 * Sends consolidated profile data to the LLM to strip noise, summarize, and optimize for embedding.
 */
export async function cleanProfileWithLLM(consolidatedText: string): Promise<string> {
  const systemPrompt = `You are a professional CV analyzer. Your goal is to rewrite the candidate's CV to make it extremely dense, technical, and clean of any verbal fluff or formatting noise.
Optimize the output text specifically for semantic search (vector embedding matching).

Instructions:
1. Extract and list core technical stacks, frameworks, databases, and programming languages.
2. Summarize roles, key achievements, years of experience with specific technologies, and major projects.
3. Remove any decorative writing, self-praising adjectives, filler words, or contact information.
4. Output a concise, clean, fact-based technical description of the candidate's profile.
5. Return ONLY the cleaned profile text. Do not include markdown headers, wraps, introductions, or annotations.`;

  try {
    logger.info("Requesting LLM to clean user profile text...");
    const cleanedText = await generateText(consolidatedText, "summaries", systemPrompt);
    return cleanedText.trim();
  } catch (error) {
    logger.error("LLM cleaning of user profile failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
