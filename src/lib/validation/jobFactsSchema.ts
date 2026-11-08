import { z } from "zod";

/**
 * Structured facts extracted from a raw job description via LLM `generateJSON`
 * (capability "parsing", `classifyJobListing()`). Validates the LLM's raw JSON output
 * before persistence — a `safeParse` failure moves the job straight to
 * `classificationStatus=FAILED` with no attempts-loop retry (FR-22, spectech.md Error
 * Handling Strategy: a malformed structure won't self-correct by retrying the same prompt).
 *
 * Shape mirrors `match-score-architecture.md` §3.2's job-extraction contract exactly
 * (spectech.md Data Models / Database Schema).
 */
const SALARY_PERIODS = ["HOURLY", "MONTHLY", "YEARLY"] as const;

/**
 * Tolerant preprocess for `salaryPeriod` (spectech D10). Tri-state is preserved:
 * `undefined` (key absent, legacy) stays `undefined`, `null` stays `null`, a
 * case-insensitive HOURLY|MONTHLY|YEARLY match is upper-cased, and anything else
 * (unrecognised or empty string, wrong type) becomes `null` so a bad period never
 * fails the whole job.
 */
export function normalisePeriod(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (SALARY_PERIODS as readonly string[]).includes(upper) ? upper : null;
}

/**
 * Bounded, log-safe description of an untrusted raw value: its type plus at most
 * 32 characters of its string form with control characters (incl. newlines) removed.
 */
export function describeUntrustedForLog(value: unknown): {
  rawType: string;
  raw: string;
} {
  let text: string;
  try {
    text = String(value);
  } catch {
    text = "";
  }
  return {
    rawType: typeof value,
    raw: text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 32),
  };
}

export const JobFactsSchema = z.object({
  mustHave: z.array(z.string().min(1).max(100)).max(50),
  niceToHave: z.array(z.string().min(1).max(100)).max(50),
  softSkills: z.array(z.string().min(1).max(100)).max(50),
  seniority: z
    .enum(["junior", "mid", "senior", "lead", "principal"])
    .nullable(),
  yearsExperienceMin: z.number().int().nonnegative().nullable(),
  employmentType: z.enum(["permanent", "contract", "freelance"]).nullable(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  isWorldwide: z.boolean().nullable(),
  requiresUsWorkAuth: z.boolean().nullable(),
  providesRelocationVisa: z.boolean().nullable(),
  location: z.string().max(200).nullable(),
  salaryMin: z.number().max(10_000_000).nullable(),
  salaryMax: z.number().max(10_000_000).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  salaryPeriod: z
    .preprocess(normalisePeriod, z.enum(SALARY_PERIODS).nullable())
    .optional(),
});

export type JobFacts = z.infer<typeof JobFactsSchema>;
