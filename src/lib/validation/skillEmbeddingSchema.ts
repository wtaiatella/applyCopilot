import { z } from "zod";

/**
 * LLM alias-confirmation response contract (spectech.md FR-05 step 3): a single boolean
 * answering "is this candidate string the same technology/skill as the top-1 vector match?".
 * Validated via `generateJSON`'s existing `safeParse`-at-call-site convention (same pattern
 * as every other `generateJSON<T>` caller in this codebase).
 */
export const SkillAliasConfirmationSchema = z.object({
  sameTechnology: z.boolean(),
});

export type SkillAliasConfirmation = z.infer<
  typeof SkillAliasConfirmationSchema
>;

/**
 * Lookup-key length guard (015 rework, item 2): `SkillEmbedding.skill` / `SkillAlias.alias` are
 * `VARCHAR(100)` at the DB level (prisma/migrations/20260824150000_skill_vocabulary). Checked
 * before any write so an oversized normalized skill string degrades gracefully instead of
 * hitting a Postgres "value too long" error.
 */
export const SkillKeySchema = z.string().max(100);
