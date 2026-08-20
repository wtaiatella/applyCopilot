import { z } from "zod";

/**
 * Structured facts extracted from a candidate profile via LLM `generateJSON`
 * (capability "profile"). Validates the LLM's raw JSON output before persistence —
 * a `safeParse` failure means the extraction is malformed and must not be written to
 * `UserProfile.profileFacts` (FR-22, spectech.md Error Handling Strategy).
 *
 * Shape mirrors `match-score-architecture.md` §3.2's profile-extraction contract
 * exactly (spectech.md Data Models / Database Schema).
 */
export const ProfileFactsSchema = z.object({
  skills: z.array(z.string().min(1).max(100)).max(50),
  softSkills: z.array(z.string().min(1).max(100)).max(50),
  seniority: z.enum(["junior", "mid", "senior", "lead", "principal"]),
  totalYearsExperience: z.number().int().nonnegative().max(60),
  domains: z.array(z.string().min(1).max(100)).max(50),
});

export type ProfileFacts = z.infer<typeof ProfileFactsSchema>;
