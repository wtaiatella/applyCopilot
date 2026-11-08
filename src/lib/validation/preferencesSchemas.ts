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
export const UserPreferencesInputSchema = z
  .object({
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
    // HOURLY is allowed by the DB enum but is never a valid preference period (APC-44 D9).
    salaryPeriod: z.enum(["YEARLY", "MONTHLY"]).default("YEARLY"),
    hourlyMin: z.number().nonnegative().max(100_000).nullable().default(null),
    hourlyCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),

    excludeKeywords: z.array(z.string().min(1).max(200)).max(50).default([]),
  })
  .superRefine((val, ctx) => {
    if (
      val.salaryPeriod === "MONTHLY" &&
      val.salaryMin !== null &&
      val.salaryMin > 1_000_000
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salaryMin"],
        message: "Monthly minimum salary must be at most 1,000,000",
      });
    }
  });

export type UserPreferencesInput = z.infer<typeof UserPreferencesInputSchema>;
