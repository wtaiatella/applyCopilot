import { generateJSON } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";
import type { JobFacts } from "../lib/validation/jobFactsSchema";
import { resolveCanonicalSkills } from "./skillCanonicalizationService";
import { SkillKeySchema } from "../lib/validation/skillEmbeddingSchema";

/**
 * Mirrors `JobFactsSchema`'s `.max(50)` cap on `mustHave`/`niceToHave`/
 * `softSkills` (see jobFactsSchema.ts). Enforced here too so an oversized
 * raw LLM extraction can't trigger unbounded sequential canonicalization
 * calls before the schema validation ever runs (security fix, Phase 3
 * rework) — most severe on the untrusted, unattended job-classification
 * worker path (batches of up to 20 jobs/run).
 */
const MAX_SKILLS_PER_FIELD = 50;

/** The subset of JobListing fields needed by the classification service. */
export interface JobListingInput {
  id: string;
  title: string;
  company: string;
  fullDescription: string;
}

/** The structured output returned by the classification service. */
export interface ClassificationResult {
  jobFacts: JobFacts;
}

/**
 * Sends a raw job listing description to the configured "Parsing Provider" LLM
 * and returns a structured `JobFacts` extraction optimized for deterministic
 * scoring (Stage 2) and a focused `mustHave` skill-list embedding (Stage 1).
 *
 * The LLM extracts must-have/nice-to-have/soft skills, seniority, years of
 * experience, employment type, work mode, and the explicit conditions that
 * feed hard disqualification (worldwide-only, US work authorization,
 * relocation/visa sponsorship) — see spectech.md Data Models.
 *
 * The caller (classification worker) is responsible for validating the
 * returned shape via `JobFactsSchema` before persisting (FR-22) — this
 * service does not validate, matching the Error Handling Strategy's
 * separation of extraction from validation.
 *
 * @param job A JobListing object with the raw fullDescription.
 * @returns A `ClassificationResult` containing the raw extracted `jobFacts`.
 * @throws Re-throws LLM errors so the caller (worker) can handle circuit breaking and retry logic.
 */
export async function classifyJobListing(
  job: JobListingInput,
): Promise<ClassificationResult> {
  logger.info(
    `[JobClassificationService] Classifying job listing: "${job.title}" at ${job.company} (id: ${job.id})`,
  );

  const systemPrompt = buildClassificationSystemPrompt();
  const userPrompt = buildClassificationUserPrompt(job);

  const jobFacts = await generateJSON<JobFacts>(
    userPrompt,
    "parsing",
    systemPrompt,
  );

  logger.info(
    `[JobClassificationService] Successfully classified job listing ${job.id}`,
  );

  return { jobFacts };
}

/**
 * Write-path canonicalization wiring (T008, spectech.md FR-08): rewrites `jobFacts.mustHave` +
 * `jobFacts.niceToHave` (`kind: HARD`) and `jobFacts.softSkills` (`kind: SOFT`) to their
 * resolved canonical `displayName` via `resolveCanonicalSkills`, before the caller
 * (classification worker) runs `JobFactsSchema` validation and persists.
 *
 * Defensive: `resolveCanonicalSkills` is only called when a field is already the expected
 * array-of-strings shape — a malformed LLM extraction is passed through untouched so the
 * caller's `JobFactsSchema.safeParse` still catches and rejects it exactly as before this
 * wiring existed (FR-22 behavior preserved). `mustHave` and `niceToHave` are canonicalized
 * together (single `resolveCanonicalSkills` call, both `kind: HARD`) so a skill repeated
 * across both lists dedupes to one embedding/LLM call (spectech.md Implementation Notes).
 *
 * Per-string length pre-check (fast-follow, 015 QA §7.0 finding): a candidate exceeding
 * `JobFactsSchema`'s own per-item `.max(100)` (same bound as `SkillKeySchema`) is excluded from
 * the batch sent to `resolveCanonicalSkills` — untrusted scraped job-posting text is the highest-
 * volume, least-trusted source of oversized/garbled extraction, and an oversized candidate can
 * never resolve to a persistable canonical entry anyway; `JobFactsSchema.safeParse` will reject
 * the whole record downstream regardless, so there is no point spending an embedding/LLM call on
 * it (up to 150 candidates per job across mustHave+niceToHave+softSkills). The candidate is left
 * as its original string in the output (falls through via `?? s` below).
 *
 * @param jobFacts The raw (not yet schema-validated) extraction from `classifyJobListing`.
 * @returns `jobFacts` with `mustHave`/`niceToHave`/`softSkills` rewritten to canonical names.
 */
export async function canonicalizeJobFacts(
  jobFacts: JobFacts,
): Promise<JobFacts> {
  const withinLength = (s: unknown): s is string =>
    typeof s === "string" && SkillKeySchema.safeParse(s).success;

  const hardSkillsValid =
    Array.isArray(jobFacts.mustHave) && Array.isArray(jobFacts.niceToHave);
  const hardMap = hardSkillsValid
    ? await resolveCanonicalSkills(
        [
          ...jobFacts.mustHave
            .filter(withinLength)
            .slice(0, MAX_SKILLS_PER_FIELD),
          ...jobFacts.niceToHave
            .filter(withinLength)
            .slice(0, MAX_SKILLS_PER_FIELD),
        ],
        "HARD",
      )
    : null;
  const softMap = Array.isArray(jobFacts.softSkills)
    ? await resolveCanonicalSkills(
        jobFacts.softSkills.filter(withinLength).slice(0, MAX_SKILLS_PER_FIELD),
        "SOFT",
      )
    : null;

  return {
    ...jobFacts,
    // Dedupe after canonicalization (not before): two differently-spelled raw extractions
    // (e.g. "Postgres" and "PostgreSQL") only collapse to the same string once mapped through
    // `hardMap`/`softMap` — deduping the raw array first would miss that. Preserves first-seen
    // order (Set insertion order) so display ordering stays stable.
    mustHave: hardMap
      ? Array.from(new Set(jobFacts.mustHave.map((s) => hardMap.get(s) ?? s)))
      : jobFacts.mustHave,
    niceToHave: hardMap
      ? Array.from(new Set(jobFacts.niceToHave.map((s) => hardMap.get(s) ?? s)))
      : jobFacts.niceToHave,
    softSkills: softMap
      ? Array.from(new Set(jobFacts.softSkills.map((s) => softMap.get(s) ?? s)))
      : jobFacts.softSkills,
  };
}

/**
 * Builds the system prompt for the job listing classification request.
 */
function buildClassificationSystemPrompt(): string {
  return `You are a technical job description analyzer. Your goal is to extract a structured, fact-based summary of a job listing, optimized for deterministic candidate-matching logic.

Return ONLY a raw JSON object with exactly these properties (no markdown, no commentary, no wrapping):
{
  "mustHave": string[],           // required technical skills, languages, frameworks, databases, tools (canonical vocabulary, see below)
  "niceToHave": string[],         // preferred/bonus technical skills (same vocabulary rules)
  "softSkills": string[],         // required soft skills (e.g. "communication", "leadership")
  "seniority": "junior" | "mid" | "senior" | "lead" | "principal" | null,
  "yearsExperienceMin": number | null,     // minimum years of experience required overall, if stated
  "employmentType": "permanent" | "contract" | "freelance" | null,
  "workMode": "remote" | "hybrid" | "onsite" | null,
  "isWorldwide": boolean | null,           // true only if the listing explicitly states it is open to candidates worldwide/any country
  "requiresUsWorkAuth": boolean | null,    // true only if the listing explicitly requires US work authorization / US citizenship / a US-based visa status
  "providesRelocationVisa": boolean | null,// true only if the listing explicitly offers relocation assistance or visa sponsorship
  "location": string | null,               // free-text primary location/country, if stated
  "salaryMin": number | null,
  "salaryMax": number | null,
  "currency": string | null                // ISO 4217 3-letter code (e.g. "USD", "EUR", "BRL")
}

Vocabulary normalization rules (apply to every entry in "mustHave", "niceToHave", and "softSkills"):
1. Use canonical, widely-recognized names for technologies (e.g. "JavaScript" not "JS" or "Javascript"; "PostgreSQL" not "Postgres" or "postgres"; "Node.js" not "NodeJS" or "node").
2. Deduplicate — never list the same normalized skill twice across "mustHave"/"niceToHave".
3. One skill per entry — split combined phrases (e.g. "React/Redux" becomes two entries: "React", "Redux").
4. Prefer the industry-standard capitalization and spelling used in official documentation/branding.

Worldwide / US-work-authorization / relocation extraction rules:
- Set "isWorldwide": true ONLY when the listing explicitly states the role is open to candidates anywhere in the world (e.g. "worldwide", "remote from anywhere", "open to any country"). Otherwise null — do not infer from a generic "remote" mention alone.
- Set "requiresUsWorkAuth": true ONLY when the listing explicitly requires US work authorization, US citizenship, a US-based visa, or states "must be authorized to work in the United States". Otherwise null.
- Set "providesRelocationVisa": true ONLY when the listing explicitly offers relocation assistance or visa sponsorship. Set false ONLY when it explicitly states it does NOT sponsor visas/relocation. Otherwise null.
- Never guess these three fields from silence — omission must map to null, not false or true.

If a field is not mentioned in the listing, use null (or an empty array for the list fields). Do not include markdown headers, introductions, annotations, or JSON wrapping — return the raw JSON object only.`;
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
