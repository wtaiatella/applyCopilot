import { z } from "zod";

// ── Common fields ──────────────────────────────────────────────
const entityTypeSchema = z.enum(["experience", "project", "education"]);
const entityIdSchema = z.string().cuid();

// ── AI request schemas ─────────────────────────────────────────

/**
 * POST /api/profile/ai/review-all
 * Triggers a full AI review of all active bullets for a profile entity.
 */
export const ReviewAllSchema = z.object({
  entityType: entityTypeSchema,
  entityId: entityIdSchema,
});

/**
 * POST /api/profile/ai/generate-bullet
 * Generates a new bullet from the entity's AI Context Notes.
 * Returns 400 AI_CONTEXT_REQUIRED if freeFormContext is empty.
 */
export const GenerateBulletSchema = z.object({
  entityType: entityTypeSchema,
  entityId: entityIdSchema,
  // Optional user steering comment for the Regenerate flow (e.g. "make it more concise").
  userComment: z.string().max(1000).optional(),
});

/**
 * POST /api/profile/ai/review-bullet
 * Reviews and improves a single existing bullet.
 */
export const ReviewBulletSchema = z.object({
  entityType: entityTypeSchema,
  entityId: entityIdSchema,
  bulletId: z.string().cuid(),
  // Optional user steering comment for the Regenerate flow (e.g. "make it more concise").
  userComment: z.string().max(1000).optional(),
});

/**
 * POST /api/profile/ai/accept-suggestion
 * Applies an AI suggestion (rewrite / merge / new / generate) to the database.
 * Uses a discriminated union on `action` so each variant is validated separately.
 */
export const AcceptSuggestionSchema = z.discriminatedUnion("action", [
  // Rewrite: user accepts an improved version of an existing bullet.
  // Immutability rule applies (reconcileBulletMutation).
  z.object({
    action: z.literal("rewrite"),
    entityType: entityTypeSchema,
    entityId: entityIdSchema,
    bulletId: z.string().cuid(),
    newText: z.string().min(1).max(2000),
    // US-3: when the target bullet is CV-referenced, `false` requests the "Replace" (in-place)
    // path via reconcileBulletMutation's forceInPlace; omitted/`true` keeps today's "Keep
    // Original" (archive + create) behavior — safe default for the Review-All caller.
    keepOriginal: z.boolean().optional(),
  }),

  // Merge: user accepts combining 2+ bullets into one.
  // Each source bullet is soft/hard deleted per CV usage; new combined bullet created.
  z.object({
    action: z.literal("merge"),
    entityType: entityTypeSchema,
    entityId: entityIdSchema,
    bulletIds: z.array(z.string().cuid()).min(2).max(20),
    combinedText: z.string().min(1).max(2000),
  }),

  // New: user accepts an AI-suggested new bullet (from Review All).
  z.object({
    action: z.literal("new"),
    entityType: entityTypeSchema,
    entityId: entityIdSchema,
    text: z.string().min(1).max(2000),
  }),

  // Generate: user accepts a bullet generated from AI Context Notes.
  z.object({
    action: z.literal("generate"),
    entityType: entityTypeSchema,
    entityId: entityIdSchema,
    text: z.string().min(1).max(2000),
  }),
]);

// ── Inferred TypeScript types ──────────────────────────────────
export type ReviewAllInput = z.infer<typeof ReviewAllSchema>;
export type GenerateBulletInput = z.infer<typeof GenerateBulletSchema>;
export type ReviewBulletInput = z.infer<typeof ReviewBulletSchema>;
export type AcceptSuggestionInput = z.infer<typeof AcceptSuggestionSchema>;
