import { generateJSON } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";

export interface ProfileInput {
  title?: string | null;
  summary?: string | null;
  skills?: { name: string }[];
  experiences?: {
    company: string;
    position: string;
    description?: string | null;
  }[];
  education?: {
    institution: string;
    degree: string;
    fieldOfStudy?: string | null;
  }[];
  projects?: {
    name: string;
    description?: string | null;
  }[];
}

export interface JobListingInput {
  title: string;
  company: string;
  fullDescription: string | null;
}

export interface DeepAnalysisResult {
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  verdict: "APPLY" | "CAUTION" | "IGNORE";
  justification: string;
}

/**
 * Conducts a deep comparative LLM-powered analysis between the candidate's professional profile
 * and the job listing's description to generate strengths, weaknesses, gaps, and a verdict.
 *
 * @param profile The candidate's UserProfile object with experiences, education, and skills.
 * @param job The JobListing object.
 * @returns A structured DeepAnalysisResult.
 */
export async function runDeepAnalysis(
  profile: ProfileInput,
  job: JobListingInput
): Promise<DeepAnalysisResult> {
  logger.info(
    `[DeepAnalysisService] Starting deep comparative analysis for job: "${job.title}" at ${job.company}`
  );

  const systemPrompt = `You are an expert technical recruiter and career coach. Your task is to perform a rigorous, deep comparative match analysis between a candidate's professional profile and a specific job listing description.

Evaluate the match objectively and produce structured JSON output with the exact properties below. Do not include markdown headers, commentary, or wrappers (like \`\`\`json). Just return the raw JSON object.

Output JSON Schema:
{
  "strengths": ["list of candidate's key strengths and alignments matching this specific job"],
  "weaknesses": ["list of misalignments, years of experience gaps, or areas where the candidate falls short"],
  "missingSkills": ["list of explicit technical skills, languages, frameworks, or tools required by the job but absent from the candidate's profile"],
  "verdict": "APPLY" | "CAUTION" | "IGNORE",
  "justification": "A concise (2-4 sentences) explanation justifying the verdict based on the match percentage and critical requirement alignments."
}

Verdict Definitions:
- APPLY: The candidate has all or almost all critical technical requirements, matching experience levels, and is a strong fit.
- CAUTION: The candidate is missing some skills or experience levels, but possesses core transferrable skills or can grow into the role quickly.
- IGNORE: The candidate is missing foundational skills or seniority requirements, making this job a poor match.`;

  const userPrompt = buildComparativePrompt(profile, job);

  const result = await generateJSON<DeepAnalysisResult>(
    userPrompt,
    "summaries",
    systemPrompt
  );

  // Validate the returned object structure and provide default fallbacks if missing
  const strengths = Array.isArray(result.strengths) ? result.strengths : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  const missingSkills = Array.isArray(result.missingSkills) ? result.missingSkills : [];
  const verdict = ["APPLY", "CAUTION", "IGNORE"].includes(result.verdict)
    ? result.verdict
    : "CAUTION";
  const justification = typeof result.justification === "string" ? result.justification.trim() : "";

  logger.info(
    `[DeepAnalysisService] Completed deep analysis. Verdict: ${verdict}`
  );

  return {
    strengths,
    weaknesses,
    missingSkills,
    verdict,
    justification,
  };
}

/**
 * Serializes the candidate profile and job description details into a single prompt string.
 */
function buildComparativePrompt(profile: ProfileInput, job: JobListingInput): string {
  const profileTitle = profile.title || "Not specified";
  const profileSummary = profile.summary || "Not specified";
  
  const skillsList = profile.skills?.map((s) => s.name).join(", ") || "None";
  
  const experienceList =
    profile.experiences
      ?.map(
        (e) =>
          `- ${e.position} at ${e.company}: ${e.description || "No description"}`
      )
      .join("\n") || "None";

  const educationList =
    profile.education
      ?.map(
        (ed) =>
          `- ${ed.degree} in ${ed.fieldOfStudy || "N/A"} from ${ed.institution}`
      )
      .join("\n") || "None";

  const projectsList =
    profile.projects
      ?.map((p) => `- ${p.name}: ${p.description || "No description"}`)
      .join("\n") || "None";

  return `=== CANDIDATE PROFILE ===
Title: ${profileTitle}
Summary: ${profileSummary}
Technical Skills: ${skillsList}

Work Experiences:
${experienceList}

Education:
${educationList}

Projects:
${projectsList}

=== JOB LISTING ===
Title: ${job.title}
Company: ${job.company}
Description:
${job.fullDescription || "No description available."}
`;
}
