import { logger } from "@/lib/logging/logger";
import { reconcileBulletMutation } from "@/lib/db/bulletMutations";
import {
  reconcileSummaryMutation,
  reconcileSkillMutation,
} from "@/lib/db/cvBulletMutations";
import type { CVSnapshotData, CVSnapshotBullet } from "@/types/cv";

interface CreateOnlyClient {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

// `findFirst` (not `findUnique`) so the `where` can carry the `profileId` ownership
// scope alongside `id` — this is what prevents a snapshot-supplied `source*Id` from
// being used to read/mutate another profile's row (cross-tenant IDOR guard).
interface FindFirstByProfileClient<T> {
  findFirst(args: {
    where: { id: string; profileId: string };
  }): Promise<T | null>;
}

interface FindManyClient {
  findMany(args: {
    where: Record<string, unknown>;
  }): Promise<Array<{ id: string; text: string; type: string }>>;
}

// Structural subset of a Prisma transaction client this service needs — matches the
// (unexported) MinimalTx shapes already used by `bulletMutations.ts`/`cvBulletMutations.ts`.
type ReconcileTx = Parameters<typeof reconcileBulletMutation>[0] &
  Parameters<typeof reconcileSummaryMutation>[0] & {
    experience: CreateOnlyClient & FindFirstByProfileClient<{ id: string }>;
    education: CreateOnlyClient & FindFirstByProfileClient<{ id: string }>;
    project: CreateOnlyClient & FindFirstByProfileClient<{ id: string }>;
    experienceBullet: CreateOnlyClient & FindManyClient;
    educationBullet: CreateOnlyClient & FindManyClient;
    projectBullet: CreateOnlyClient & FindManyClient;
    profileSummary: CreateOnlyClient &
      FindFirstByProfileClient<{ content: string }>;
    skill: CreateOnlyClient &
      FindFirstByProfileClient<{
        name: string;
        proficiency: string;
        yearsExperience: number | null;
      }>;
    cVBullet: {
      count(args: { where: Record<string, string> }): Promise<number>;
      create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    };
  };

/**
 * Thrown when a snapshot-supplied `source*Id` does not belong to `cv.profileId` —
 * i.e. the client tampered with `snapshotData` to point at another profile's row
 * (cross-tenant IDOR attempt). The caller's `prisma.$transaction` rolls back
 * entirely on this error — Apply is atomic, all-or-nothing (matches the existing
 * "reconciliation runs entirely inside one transaction" guarantee).
 */
export class CVApplyOwnershipViolationError extends Error {
  constructor(modelName: string, id: string, profileId: string) {
    super(
      `${modelName} ${id} does not belong to profile ${profileId} — snapshot integrity violation`,
    );
    this.name = "CVApplyOwnershipViolationError";
  }
}

/**
 * Verifies a snapshot-supplied `source*Id` belongs to `profileId` before it is used in any
 * further read/update/create — the single choke point for the cross-tenant IDOR guard
 * across experience/education/project parents and ProfileSummary/Skill. Returns the row
 * (already scoped to `profileId`) so callers can reuse it instead of a second lookup.
 *
 * Throws `CVApplyOwnershipViolationError` on a mismatch/missing row — this should not
 * happen for a legitimate client (the snapshot was cloned from the same profile), so any
 * violation fails the whole Apply rather than silently skipping or creating a duplicate.
 */
async function assertOwnedByProfile<T>(
  client: FindFirstByProfileClient<T>,
  modelName: string,
  id: string,
  profileId: string,
): Promise<T> {
  const row = await client.findFirst({ where: { id, profileId } });
  if (!row) {
    logger.warn("cv_apply_ownership_violation", {
      model: modelName,
      id,
      profileId,
    });
    throw new CVApplyOwnershipViolationError(modelName, id, profileId);
  }
  return row;
}

type BulletParentKind = "experience" | "education" | "project";

const BULLET_TABLE: Record<
  BulletParentKind,
  "experienceBullet" | "educationBullet" | "projectBullet"
> = {
  experience: "experienceBullet",
  education: "educationBullet",
  project: "projectBullet",
};

const BULLET_FK: Record<
  BulletParentKind,
  "experienceBulletId" | "educationBulletId" | "projectBulletId"
> = {
  experience: "experienceBulletId",
  education: "educationBulletId",
  project: "projectBulletId",
};

const PARENT_FK_FIELD: Record<BulletParentKind, string> = {
  experience: "experienceId",
  education: "educationId",
  project: "projectId",
};

export interface CVForReconciliation {
  id: string;
  profileId: string;
  snapshotData: CVSnapshotData;
}

interface ReconcileCounts {
  unchanged: number;
  edited: number;
  created: number;
}

/**
 * Reconciles every `included` bullet in one parent entity (experience/education/project)
 * against the master Profile, applying the uniform 3-way rule (FR-15):
 *   - no source (brand new) → create fresh, active, mark used
 *   - source present, text unchanged → mark used only (no master mutation)
 *   - source present, text changed → `reconcileBulletMutation` (006, unchanged, reused as-is)
 *
 * Non-`included` bullets are simply skipped — never created/archived/marked used (AC.3a).
 * `sourceBulletsById` is empty when the parent entity itself is brand new (no master row to
 * diff against yet), so every bullet on a brand-new entity is necessarily treated as new too.
 */
async function reconcileBullets(
  tx: ReconcileTx,
  cvId: string,
  kind: BulletParentKind,
  masterParentId: string,
  bullets: CVSnapshotBullet[],
  sourceBulletsById: Map<string, { text: string }>,
  counts: ReconcileCounts,
): Promise<void> {
  const table = BULLET_TABLE[kind];
  const fkKey = BULLET_FK[kind];
  const parentFkField = PARENT_FK_FIELD[kind];

  for (const bullet of bullets) {
    if (!bullet.included) continue; // FR-15/AC.3a: non-included pool items are untouched

    if (
      !bullet.sourceBulletId ||
      !sourceBulletsById.has(bullet.sourceBulletId)
    ) {
      // Brand new (or the parent entity itself is brand new) — create fresh & active, mark used.
      const created = await tx[table].create({
        data: {
          [parentFkField]: masterParentId,
          text: bullet.text,
          type: bullet.type,
          isActive: true,
          isArchived: false,
          sortOrder: bullet.sortOrder,
        },
      });
      await tx.cVBullet.create({
        data: { cvId, [fkKey]: created.id, renderedText: bullet.text },
      });
      counts.created++;
      continue;
    }

    const source = sourceBulletsById.get(bullet.sourceBulletId)!;
    if (source.text === bullet.text) {
      // Unchanged — mark used only, no master mutation.
      await tx.cVBullet.create({
        data: {
          cvId,
          [fkKey]: bullet.sourceBulletId,
          renderedText: bullet.text,
        },
      });
      counts.unchanged++;
    } else {
      // Edited — reuse 006's reconcileBulletMutation unchanged.
      const result = await reconcileBulletMutation(
        tx,
        bullet.sourceBulletId,
        bullet.text,
        table,
        fkKey,
        masterParentId,
        bullet.sortOrder,
        bullet.type,
      );
      await tx.cVBullet.create({
        data: { cvId, [fkKey]: result.newBulletId, renderedText: bullet.text },
      });
      counts.edited++;
    }
  }
}

async function loadMasterBullets(
  tx: ReconcileTx,
  kind: BulletParentKind,
  masterParentId: string,
): Promise<Map<string, { text: string }>> {
  const table = BULLET_TABLE[kind];
  const parentFkField = PARENT_FK_FIELD[kind];
  const rows = await tx[table].findMany({
    where: { [parentFkField]: masterParentId },
  });
  return new Map(rows.map((r) => [r.id, { text: r.text }]));
}

/**
 * Apply-time 3-way reconciliation (FR-14–FR-17, AC.3a, AC.9, AC.10) across bullets, summary,
 * skills, plus brand-new entity creation. Must be called from inside the caller's
 * `prisma.$transaction` — this function performs no transaction management itself, and
 * `CV.status`/`appliedAt` must be set as the LAST statement in that same transaction by the
 * caller (see `POST /api/cv/[cvId]/apply`).
 *
 * Processes ONLY items marked `included` (FR-15) — items merely present in the snapshot pool,
 * or deleted during editing, are simply absent from what's iterated and are left completely
 * untouched (not created, not archived, not marked used — AC.3a).
 *
 * Metadata-only edits to an existing entity (tabLabel, dates, etc.) are never propagated —
 * only bullet/summary/skill content changes and brand-new entities ever write to the master
 * Profile (FR-17); an existing entity's own fields (company, position, dates, tabLabel, ...)
 * are intentionally never read from the snapshot here.
 */
export async function reconcileCVApply(
  tx: ReconcileTx,
  cv: CVForReconciliation,
): Promise<void> {
  const snapshot = cv.snapshotData;
  const profileId = cv.profileId;
  const counts: ReconcileCounts = { unchanged: 0, edited: 0, created: 0 };

  // ── Experiences ──
  for (const exp of snapshot.experiences) {
    let masterExperienceId = exp.sourceExperienceId;
    let sourceBulletsById = new Map<string, { text: string }>();

    if (!masterExperienceId) {
      // FR-16: brand-new entity — create on master Profile, active.
      const created = await tx.experience.create({
        data: {
          profileId,
          company: exp.company,
          position: exp.position,
          startDate: new Date(exp.startDate),
          endDate: exp.endDate ? new Date(exp.endDate) : null,
          current: exp.current,
          tabLabel: exp.tabLabel,
          freeFormContext: exp.freeFormContext,
        },
      });
      masterExperienceId = created.id;
      counts.created++;
    } else {
      // Cross-tenant IDOR guard: verify the snapshot-supplied sourceExperienceId is actually
      // owned by this profile BEFORE loading/mutating any of its bullets.
      await assertOwnedByProfile(
        tx.experience,
        "Experience",
        masterExperienceId,
        profileId,
      );
      sourceBulletsById = await loadMasterBullets(
        tx,
        "experience",
        masterExperienceId,
      );
    }

    await reconcileBullets(
      tx,
      cv.id,
      "experience",
      masterExperienceId,
      exp.bullets,
      sourceBulletsById,
      counts,
    );
  }

  // ── Education ──
  for (const edu of snapshot.education) {
    let masterEducationId = edu.sourceEducationId;
    let sourceBulletsById = new Map<string, { text: string }>();

    if (!masterEducationId) {
      const created = await tx.education.create({
        data: {
          profileId,
          institution: edu.institution,
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
          startDate: new Date(edu.startDate),
          endDate: edu.endDate ? new Date(edu.endDate) : null,
          current: edu.current,
          hideEndDate: edu.hideEndDate,
          tabLabel: edu.tabLabel,
          freeFormContext: edu.freeFormContext,
        },
      });
      masterEducationId = created.id;
      counts.created++;
    } else {
      // Cross-tenant IDOR guard: verify the snapshot-supplied sourceEducationId is actually
      // owned by this profile BEFORE loading/mutating any of its bullets.
      await assertOwnedByProfile(
        tx.education,
        "Education",
        masterEducationId,
        profileId,
      );
      sourceBulletsById = await loadMasterBullets(
        tx,
        "education",
        masterEducationId,
      );
    }

    await reconcileBullets(
      tx,
      cv.id,
      "education",
      masterEducationId,
      edu.bullets,
      sourceBulletsById,
      counts,
    );
  }

  // ── Projects ──
  for (const proj of snapshot.projects) {
    let masterProjectId = proj.sourceProjectId;
    let sourceBulletsById = new Map<string, { text: string }>();

    if (!masterProjectId) {
      const created = await tx.project.create({
        data: {
          profileId,
          name: proj.name,
          startDate: proj.startDate ? new Date(proj.startDate) : null,
          endDate: proj.endDate ? new Date(proj.endDate) : null,
          current: proj.current,
          technologies: proj.technologies,
          tabLabel: proj.tabLabel,
          freeFormContext: proj.freeFormContext,
        },
      });
      masterProjectId = created.id;
      counts.created++;
    } else {
      // Cross-tenant IDOR guard: verify the snapshot-supplied sourceProjectId is actually
      // owned by this profile BEFORE loading/mutating any of its bullets.
      await assertOwnedByProfile(
        tx.project,
        "Project",
        masterProjectId,
        profileId,
      );
      sourceBulletsById = await loadMasterBullets(
        tx,
        "project",
        masterProjectId,
      );
    }

    await reconcileBullets(
      tx,
      cv.id,
      "project",
      masterProjectId,
      proj.bullets,
      sourceBulletsById,
      counts,
    );
  }

  // ── Summaries (FR-15: only `included` summaries are processed) ──
  for (const summary of snapshot.summaries) {
    if (!summary.included) continue;

    if (!summary.sourceSummaryId) {
      const created = await tx.profileSummary.create({
        data: {
          profileId,
          title: summary.title,
          content: summary.content,
          isAIGenerated: summary.isAIGenerated,
          isActive: true,
          sortOrder: 0,
        },
      });
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          summaryId: created.id,
          renderedText: summary.content,
        },
      });
      counts.created++;
      continue;
    }

    // Cross-tenant IDOR guard: `findFirst` scoped to `{ id, profileId }` — a mismatch throws
    // and rolls back the whole Apply, rather than silently falling through and creating a
    // duplicate as a bare `findUnique` would.
    const master = await assertOwnedByProfile(
      tx.profileSummary,
      "ProfileSummary",
      summary.sourceSummaryId,
      profileId,
    );

    if (master.content === summary.content) {
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          summaryId: summary.sourceSummaryId,
          renderedText: summary.content,
        },
      });
      counts.unchanged++;
    } else {
      const result = await reconcileSummaryMutation(
        tx,
        summary.sourceSummaryId,
        summary.content,
        profileId,
        summary.title,
        summary.isAIGenerated,
        0,
      );
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          summaryId: result.newId,
          renderedText: summary.content,
        },
      });
      counts.edited++;
    }
  }

  // ── Skills (FR-15: only `included` skills are processed) ──
  for (const skill of snapshot.skills) {
    if (!skill.included) continue;

    if (!skill.sourceSkillId) {
      const created = await tx.skill.create({
        data: {
          profileId,
          name: skill.name,
          proficiency: skill.proficiency,
          yearsExperience: skill.yearsExperience,
          isActive: true,
          isArchived: false,
        },
      });
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          skillId: created.id,
          renderedText: `${skill.name} (${skill.proficiency})`,
        },
      });
      counts.created++;
      continue;
    }

    // Cross-tenant IDOR guard: `findFirst` scoped to `{ id, profileId }` — a mismatch throws
    // and rolls back the whole Apply, rather than silently falling through and creating a
    // duplicate as a bare `findUnique` would.
    const master = await assertOwnedByProfile(
      tx.skill,
      "Skill",
      skill.sourceSkillId,
      profileId,
    );
    const unchanged =
      master.name === skill.name &&
      master.proficiency === skill.proficiency &&
      master.yearsExperience === skill.yearsExperience;

    if (unchanged) {
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          skillId: skill.sourceSkillId,
          renderedText: `${skill.name} (${skill.proficiency})`,
        },
      });
      counts.unchanged++;
    } else {
      const result = await reconcileSkillMutation(
        tx,
        skill.sourceSkillId,
        profileId,
        skill.name,
        skill.proficiency,
        skill.yearsExperience,
      );
      await tx.cVBullet.create({
        data: {
          cvId: cv.id,
          skillId: result.newId,
          renderedText: `${skill.name} (${skill.proficiency})`,
        },
      });
      counts.edited++;
    }
  }

  logger.info("cv_applied", {
    cvId: cv.id,
    unchangedCount: counts.unchanged,
    editedCount: counts.edited,
    newCount: counts.created,
  });
}
