import { generateText } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";

/** The subset of JobListing fields needed by the classification service. */
export interface JobListingInput {
  id: string;
  title: string;
  company: string;
  fullDescription: string;
}

/** The structured output returned by the classification service. */
export interface ClassificationResult {
  cleanedSummary: string;
}

/**
 * Sends a raw job listing description to the configured "Parsing Provider" LLM
 * and returns a clean, noise-free technical summary optimized for vector embedding.
 *
 * The LLM strips corporate boilerplate (benefits, perks, company history, diversity
 * disclaimers) and retains only the technical signal: required technologies,
 * years of experience, seniority level, remote status, and core responsibilities.
 *
 * @param job A JobListing object with the raw fullDescription.
 * @returns A `ClassificationResult` containing the cleaned technical summary string.
 * @throws Re-throws LLM errors so the caller (worker) can handle circuit breaking and retry logic.
 */
export async function classifyJobListing(job: JobListingInput): Promise<ClassificationResult> {
  logger.info(`[JobClassificationService] Cleaning job listing: "${job.title}" at ${job.company} (id: ${job.id})`);

  const systemPrompt = buildClassificationSystemPrompt();
  const userPrompt = buildClassificationUserPrompt(job);

  const cleanedSummary = await generateText(userPrompt, "parsing", systemPrompt);

  if (!cleanedSummary || !cleanedSummary.trim()) {
    throw new Error(`[JobClassificationService] LLM returned an empty summary for job ${job.id}`);
  }

  logger.info(`[JobClassificationService] Successfully cleaned job listing ${job.id} (output length: ${cleanedSummary.length} chars)`);

  return { cleanedSummary: cleanedSummary.trim() };
}

/**
 * Builds the system prompt for the job listing classification request.
 */
function buildClassificationSystemPrompt(): string {
  return `You are a technical job description analyzer. Your goal is to transform raw, verbose job listings into concise, noise-free technical summaries optimized for semantic search and vector embedding matching.

Instructions:
1. Extract ONLY the following technical signal from the job description:
   - Required technical skills, languages, frameworks, databases, and tools.
   - Required years of experience per technology or overall.
   - Seniority level (Junior, Mid, Senior, Lead, Principal, etc.).
   - Remote/hybrid/on-site status and country/location requirements.
   - Core responsibilities and technical deliverables (2-4 bullet points max).
2. DISCARD all of the following:
   - Company history, culture descriptions, mission statements.
   - Benefits, perks, salary ranges, stock options, health plans.
   - Equal opportunity / diversity / inclusion disclaimers.
   - Application instructions, links, or contact information.
   - Generic corporate filler phrases (e.g. "fast-paced environment", "team player", "passion for").
3. Write the summary in a dense, fact-based, keyword-rich format.
4. Return ONLY the cleaned technical summary. Do not include markdown headers, introductions, annotations, or JSON wrapping.`;
}

/**
 * Builds the user prompt for the job listing classification request.
 */
function buildClassificationUserPrompt(job: JobListingInput): string {
  return `Job Title: ${job.title}
Company: ${job.company}

Raw Job Description:
${job.fullDescription}`;
}
