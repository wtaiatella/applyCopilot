import { prisma } from "../lib/db/prisma";
import { generateJSON } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";
import type { ProfileFacts } from "../lib/validation/profileFactsSchema";
import { resolveCanonicalSkills } from "./skillCanonicalizationService";

/**
 * Mirrors `ProfileFactsSchema`'s `.max(50)` cap on `skills`/`softSkills`
 * (see profileFactsSchema.ts). Enforced here too so an oversized raw LLM
 * extraction can't trigger unbounded sequential canonicalization calls
 * before the schema validation ever runs (security fix, Phase 3 rework).
 */
const MAX_SKILLS_PER_FIELD = 50;

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
export async function fetchUserProfileData(
  userId: string,
): Promise<ProfileData | null> {
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
      const activeBullets = exp.bullets.filter(
        (b) => b.isActive && !b.isArchived,
      );
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
      parts.push(
        `- ${edu.degree}${field} at ${edu.institution} (${dateRange})`,
      );

      const activeBullets = edu.bullets.filter(
        (b) => b.isActive && !b.isArchived,
      );
      activeBullets.forEach((bullet) => {
        parts.push(`  * ${bullet.text}`);
      });
    });
  }

  // Projects
  if (profile.projects.length > 0) {
    parts.push("\nKey Projects:");
    profile.projects.forEach((proj) => {
      const tech =
        proj.technologies.length > 0
          ? ` (Technologies: ${proj.technologies.join(", ")})`
          : "";
      parts.push(`- Project: ${proj.name}${tech}`);

      const activeBullets = proj.bullets.filter(
        (b) => b.isActive && !b.isArchived,
      );
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
 * Sends consolidated profile data to the LLM (capability "profile", generic
 * DB->AI_PROVIDER_DEFAULT->env fallback chain via `resolveAIConfig`) and returns a
 * structured `ProfileFacts` extraction optimized for deterministic scoring (Stage 2)
 * and a focused skills-list embedding (Stage 1).
 *
 * The caller (`POST /api/profile/sync`) is responsible for validating the returned
 * shape via `ProfileFactsSchema` before persisting (FR-22) — this service does not
 * validate, matching the Error Handling Strategy's separation of extraction from
 * validation (mirrors `jobClassificationService.classifyJobListing`).
 *
 * @param consolidatedText The consolidated, human-readable profile text (see `consolidateProfileToText`).
 * @returns A raw (unvalidated) `ProfileFacts` extraction.
 * @throws Re-throws LLM errors so the caller can distinguish extraction failures from validation failures.
 */
export async function extractProfileFacts(
  consolidatedText: string,
): Promise<ProfileFacts> {
  const systemPrompt = buildProfileExtractionSystemPrompt();

  try {
    logger.info("Requesting LLM to extract structured ProfileFacts...");
    const profileFacts = await generateJSON<ProfileFacts>(
      consolidatedText,
      "profile",
      systemPrompt,
    );
    return profileFacts;
  } catch (error) {
    logger.error("LLM extraction of ProfileFacts failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Write-path canonicalization wiring (T007, spectech.md FR-08): rewrites `profileFacts.skills`
 * (`kind: HARD`) and `profileFacts.softSkills` (`kind: SOFT`) to their resolved canonical
 * `displayName` via `resolveCanonicalSkills`, before the caller (`POST /api/profile/sync`)
 * runs `ProfileFactsSchema` validation and persists.
 *
 * Defensive: `resolveCanonicalSkills` is only called when the field is already the expected
 * array-of-strings shape — a malformed LLM extraction (e.g. `skills` not an array) is passed
 * through untouched so the caller's `ProfileFactsSchema.safeParse` still catches and rejects it
 * exactly as before this wiring existed (FR-22 behavior preserved).
 *
 * @param profileFacts The raw (not yet schema-validated) extraction from `extractProfileFacts`.
 * @returns `profileFacts` with `skills`/`softSkills` rewritten to canonical display names.
 */
export async function canonicalizeProfileFacts(
  profileFacts: ProfileFacts,
): Promise<ProfileFacts> {
  const skillsMap = Array.isArray(profileFacts.skills)
    ? await resolveCanonicalSkills(
        profileFacts.skills.slice(0, MAX_SKILLS_PER_FIELD),
        "HARD",
      )
    : null;
  const softSkillsMap = Array.isArray(profileFacts.softSkills)
    ? await resolveCanonicalSkills(
        profileFacts.softSkills.slice(0, MAX_SKILLS_PER_FIELD),
        "SOFT",
      )
    : null;

  return {
    ...profileFacts,
    skills: skillsMap
      ? profileFacts.skills.map((s) => skillsMap.get(s) ?? s)
      : profileFacts.skills,
    softSkills: softSkillsMap
      ? profileFacts.softSkills.map((s) => softSkillsMap.get(s) ?? s)
      : profileFacts.softSkills,
  };
}

/**
 * Builds the system prompt for the profile facts extraction request. Vocabulary
 * normalization rules mirror `jobClassificationService`'s job-extraction prompt
 * (spectech.md SC-03 — canonical vocabulary must agree across both extraction paths).
 */
function buildProfileExtractionSystemPrompt(): string {
  return `You are a professional CV analyzer. Your goal is to extract a structured, fact-based summary of a candidate's profile, optimized for deterministic candidate-matching logic.

Return ONLY a raw JSON object with exactly these properties (no markdown, no commentary, no wrapping):
{
  "skills": string[],                 // core technical skills, languages, frameworks, databases, tools (canonical vocabulary, see below)
  "softSkills": string[],             // soft skills demonstrated or stated (e.g. "communication", "leadership")
  "seniority": "junior" | "mid" | "senior" | "lead" | "principal",
  "totalYearsExperience": number,     // total years of professional experience, inferred from the work history
  "domains": string[]                 // industry/domain expertise (e.g. "fintech", "e-commerce", "healthcare")
}

Vocabulary normalization rules (apply to every entry in "skills" and "softSkills"):
1. Use canonical, widely-recognized names for technologies (e.g. "JavaScript" not "JS" or "Javascript"; "PostgreSQL" not "Postgres" or "postgres"; "Node.js" not "NodeJS" or "node").
2. Deduplicate — never list the same normalized skill twice.
3. One skill per entry — split combined phrases (e.g. "React/Redux" becomes two entries: "React", "Redux").
4. Prefer the industry-standard capitalization and spelling used in official documentation/branding.

If seniority cannot be inferred confidently, default to the closest match based on totalYearsExperience (junior: 0-2, mid: 2-5, senior: 5-9, lead: 9-13, principal: 13+). Do not include markdown headers, introductions, annotations, or JSON wrapping — return the raw JSON object only.`;
}
