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
});

export type JobFacts = z.infer<typeof JobFactsSchema>;
