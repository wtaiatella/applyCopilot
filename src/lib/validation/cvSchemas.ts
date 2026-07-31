import { z } from "zod";
import { isValidUrl } from "./profileSchemas";

// ── Common fields ──────────────────────────────────────────────
const entityTypeSchema = z.enum(["experience", "project", "education"]);
// Snapshot-local ids are cuid-style strings generated client- or server-side;
// they only need to be unique within one CV's JSON blob, so validate loosely,
// but still bounded to prevent unbounded-length payload abuse.
const snapshotLocalIdSchema = z.string().min(1).max(64);

// Short, single-line free-text fields (names, titles, company/position, etc.).
const shortTextSchema = z.string().max(500);
// Longer free-text fields (summary/bullet content).
const longTextSchema = z.string().max(5000);
// URL fields: allow empty/null (parity with profileSchemas.isValidUrl), but
// bound length and restrict to http/https to block javascript:/data: URIs.
const urlFieldSchema = z
  .string()
  .max(500)
  .nullable()
  .refine((v) => isValidUrl(v), { message: "Must be a valid http(s) URL" });

// ── POST /api/cv ────────────────────────────────────────────────
export const CreateCVSchema = z.object({
  jobListingId: z.string().min(1, "jobListingId is required"),
});

// ── PUT /api/cv/[cvId]/snapshot ─────────────────────────────────
const CVSnapshotBulletSchema = z.object({
  id: snapshotLocalIdSchema,
  sourceBulletId: z.string().max(64).nullable(),
  text: longTextSchema,
  type: z.enum(["BULLET", "PARAGRAPH"]),
  included: z.boolean(),
  sortOrder: z.number().int(),
});

const CVSnapshotSummarySchema = z.object({
  id: snapshotLocalIdSchema,
  sourceSummaryId: z.string().max(64).nullable(),
  title: shortTextSchema,
  content: longTextSchema,
  isAIGenerated: z.boolean(),
  included: z.boolean(),
});

const CVSnapshotSkillSchema = z.object({
  id: snapshotLocalIdSchema,
  sourceSkillId: z.string().max(64).nullable(),
  name: shortTextSchema,
  proficiency: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  yearsExperience: z.number().int().nonnegative().nullable(),
  included: z.boolean(),
});

const CVSnapshotExperienceSchema = z.object({
  id: snapshotLocalIdSchema,
  sourceExperienceId: z.string().max(64).nullable(),
  company: shortTextSchema,
  position: shortTextSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  current: z.boolean(),
  tabLabel: shortTextSchema.nullable(),
  freeFormContext: z.array(longTextSchema).max(50),
  bullets: z.array(CVSnapshotBulletSchema).max(50),
});

const CVSnapshotEducationSchema = z.object({
  id: snapshotLocalIdSchema,
  sourceEducationId: z.string().max(64).nullable(),
  institution: shortTextSchema,
  degree: shortTextSchema,
  fieldOfStudy: shortTextSchema.nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  current: z.boolean(),
  hideEndDate: z.boolean(),
  tabLabel: shortTextSchema.nullable(),
  freeFormContext: z.array(longTextSchema).max(50),
  bullets: z.array(CVSnapshotBulletSchema).max(50),
});

const CVSnapshotProjectSchema = z.object({
  id: snapshotLocalIdSchema,
  sourceProjectId: z.string().max(64).nullable(),
  name: shortTextSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  current: z.boolean(),
  technologies: z.array(shortTextSchema).max(100),
  tabLabel: shortTextSchema.nullable(),
  freeFormContext: z.array(longTextSchema).max(50),
  bullets: z.array(CVSnapshotBulletSchema).max(50),
});

const CVSnapshotBasicDataSchema = z.object({
  firstName: shortTextSchema.nullable(),
  lastName: shortTextSchema.nullable(),
  phone: shortTextSchema.nullable(),
  location: shortTextSchema.nullable(),
  linkedin: urlFieldSchema,
  github: urlFieldSchema,
  website: urlFieldSchema,
  title: shortTextSchema.nullable(),
});

/**
 * PUT /api/cv/[cvId]/snapshot
 * Full-replace validation for the entire CVSnapshotData blob (DRAFT-only).
 * Rejected atomically on any field error — never partially written.
 */
export const SnapshotUpdateSchema = z.object({
  version: z.literal(1),
  basicData: CVSnapshotBasicDataSchema,
  summaries: z.array(CVSnapshotSummarySchema).max(30),
  experiences: z.array(CVSnapshotExperienceSchema).max(30),
  education: z.array(CVSnapshotEducationSchema).max(30),
  projects: z.array(CVSnapshotProjectSchema).max(30),
  skills: z.array(CVSnapshotSkillSchema).max(100),
});

// ── AI request schemas (job-aware, CV-scoped) ───────────────────

/**
 * POST /api/cv/[cvId]/ai/review-all
 * Job-aware Review All over the CV's own snapshot (stateless).
 */
export const CVReviewAllSchema = z.object({
  entityType: entityTypeSchema,
  entityId: snapshotLocalIdSchema,
});

/**
 * POST /api/cv/[cvId]/ai/generate-bullet
 * Job-aware "Add with AI" (stateless).
 */
export const CVGenerateBulletSchema = z.object({
  entityType: entityTypeSchema,
  entityId: snapshotLocalIdSchema,
  userComment: z.string().max(1000).optional(),
});

/**
 * POST /api/cv/[cvId]/ai/review-bullet
 * Job-aware per-bullet Review (stateless).
 */
export const CVReviewBulletSchema = z.object({
  entityType: entityTypeSchema,
  entityId: snapshotLocalIdSchema,
  bulletId: snapshotLocalIdSchema,
  userComment: z.string().max(1000).optional(),
});

/**
 * POST /api/cv/[cvId]/ai/generate-summary
 * Job-aware Basic Data summary generation; no request body fields (FR-9).
 */
export const CVGenerateSummarySchema = z.object({});

// ── Inferred TypeScript types ────────────────────────────────────
export type CreateCVInput = z.infer<typeof CreateCVSchema>;
export type SnapshotUpdateInput = z.infer<typeof SnapshotUpdateSchema>;
export type CVReviewAllInput = z.infer<typeof CVReviewAllSchema>;
export type CVGenerateBulletInput = z.infer<typeof CVGenerateBulletSchema>;
export type CVReviewBulletInput = z.infer<typeof CVReviewBulletSchema>;
export type CVGenerateSummaryInput = z.infer<typeof CVGenerateSummarySchema>;
