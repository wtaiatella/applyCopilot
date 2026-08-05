import { z } from "zod";

// ── Shared unions (mirrors src/types/application.ts) ────────────
const applicationStageSchema = z.enum([
  "APPLIED",
  "SCREENING",
  "TECH_INTERVIEW",
  "OFFER",
  "FINAL",
]);

const applicationOutcomeSchema = z.enum([
  "NOT_APPROVED",
  "NO_RESPONSE",
  "DECLINED_BY_COMPANY",
  "DECLINED_BY_CANDIDATE",
  "HIRED",
]);

const contentSchema = z.string().max(5000);
const titleSchema = z.string().max(200);

// ── POST /api/applications/[applicationId]/stage ─────────────────
/**
 * Both the dropdown control and drag-and-drop send this identical shape
 * (FR-5). `outcome` is required only when transitioning into FINAL (FR-6,
 * AC.4); enforced here so the check lives in exactly one place.
 */
export const StageTransitionSchema = z
  .object({
    stage: applicationStageSchema,
    outcome: applicationOutcomeSchema.optional(),
  })
  .refine((data) => data.stage !== "FINAL" || data.outcome !== undefined, {
    message: "outcome is required when stage is FINAL",
    path: ["outcome"],
  });

// ── POST /api/applications/[applicationId]/undo ──────────────────
export const UndoSchema = z.object({
  eventId: z.string().min(1, "eventId is required"),
});

// ── POST /api/applications/[applicationId]/events ────────────────
/**
 * Discriminated union by "type" — each manual event kind has its own
 * required-field shape (FR-9).
 */
export const AddEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("NOTE"),
    content: contentSchema,
  }),
  z.object({
    type: z.literal("MEETING"),
    title: titleSchema,
    eventAt: z.string().datetime({ offset: true }),
    content: contentSchema.optional(),
  }),
  z.object({
    type: z.literal("COMPANY_RESPONSE"),
    content: contentSchema,
  }),
]);

// ── PUT /api/jobs/[id]/favorite ───────────────────────────────────
export const FavoriteSchema = z.object({
  favorite: z.boolean(),
});

// ── Inferred TypeScript types ────────────────────────────────────
export type StageTransitionInput = z.infer<typeof StageTransitionSchema>;
export type UndoInput = z.infer<typeof UndoSchema>;
export type AddEventInput = z.infer<typeof AddEventSchema>;
export type FavoriteInput = z.infer<typeof FavoriteSchema>;
