import { z } from "zod";

const nullableBoolean = z.boolean().nullable();

/**
 * Validates the `PUT /api/profile/preferences` payload before any DB write — same
 * pattern as `SkillsPayloadSchema`/`llmConfigSchema` (spectech.md Security Requirements).
 *
 * Full-object upsert (matches the existing `SkillsForm`/skills-`PUT` replace convention,
 * spectech.md Clarifications & Assumptions) — every field is present and nullable, since
 * `null` is a meaningful tri-state value ("indifferent"/"not stated"), not "unset".
 */
export const UserPreferencesInputSchema = z.object({
  seniority: z
    .enum(["junior", "mid", "senior", "lead", "principal"])
    .nullable(),
  totalYearsExperience: z.number().int().nonnegative().max(60).nullable(),

  acceptsContract: nullableBoolean,
  acceptsFreelance: nullableBoolean,
  acceptsOnsite: nullableBoolean,
  acceptsHybrid: nullableBoolean,
  acceptsRemote: nullableBoolean,

  onlyWorldwide: nullableBoolean,
  hasUsWorkAuth: nullableBoolean,
  requiresVisaRelocation: nullableBoolean,

  salaryMin: z.number().nonnegative().max(10_000_000).nullable(),
  salaryCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),

  excludeKeywords: z.array(z.string().min(1).max(200)).max(50).default([]),
});

export type UserPreferencesInput = z.infer<typeof UserPreferencesInputSchema>;
