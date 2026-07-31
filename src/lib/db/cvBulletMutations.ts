import { logger } from "../logging/logger";

export interface MutationResult {
  action: "updated" | "archived_and_created";
  newId: string;
}

// Minimal interfaces covering only the operations needed from a Prisma tx client for
// ProfileSummary/Skill mutations — mirrors bulletMutations.ts's MinimalTx pattern.
interface SummaryTableClient {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

interface SkillTableClient {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

interface CVBulletClient {
  count(args: { where: Record<string, string> }): Promise<number>;
}

interface MinimalTx {
  cVBullet: CVBulletClient;
  profileSummary: SummaryTableClient;
  skill: SkillTableClient;
  [table: string]: unknown;
}

/**
 * Sibling of `reconcileBulletMutation` (006) for `ProfileSummary` content edits.
 *
 * Immutability path (summary previously used in a generated CV):
 *   1. Archive the original: isActive = false (ProfileSummary has no isArchived column —
 *      isActive = false is its retirement signal, mirroring how it's already toggled off
 *      when a different summary variant becomes the active one).
 *   2. Create a new summary with the new content at the same sortOrder.
 *
 * Simple path (summary has never been used in a CV): in-place content update (same ID).
 */
export async function reconcileSummaryMutation(
  tx: MinimalTx,
  summaryId: string,
  newContent: string,
  profileId: string,
  title: string,
  isAIGenerated: boolean,
  sortOrder: number,
): Promise<MutationResult> {
  const usedCount = await tx.cVBullet.count({
    where: { summaryId },
  });

  if (usedCount > 0) {
    logger.info(
      "reconcileSummaryMutation: immutability path — archiving original and creating new summary",
      { summaryId, usedCount },
    );

    await tx.profileSummary.update({
      where: { id: summaryId },
      data: { isActive: false },
    });

    const newSummary = await tx.profileSummary.create({
      data: {
        profileId,
        title,
        content: newContent,
        isAIGenerated,
        isActive: true,
        sortOrder,
      },
    });

    return { action: "archived_and_created", newId: newSummary.id };
  }

  logger.info("reconcileSummaryMutation: simple path — in-place update", {
    summaryId,
  });

  await tx.profileSummary.update({
    where: { id: summaryId },
    data: { content: newContent, title },
  });

  return { action: "updated", newId: summaryId };
}

/**
 * Sibling of `reconcileBulletMutation` (006) for `Skill` content edits.
 *
 * Immutability path (skill previously used in a generated CV):
 *   1. Archive the original: isArchived = true, isActive = false — this removes it from the
 *      partial unique index's scope `(profileId, name) WHERE isArchived = false`, freeing the
 *      name for the replacement row.
 *   2. Create a new active skill with the edited fields.
 *
 * Simple path (skill has never been used in a CV): in-place update (same ID), which never
 * touches the partial unique index at all.
 */
export async function reconcileSkillMutation(
  tx: MinimalTx,
  skillId: string,
  profileId: string,
  name: string,
  proficiency: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
  yearsExperience: number | null,
): Promise<MutationResult> {
  const usedCount = await tx.cVBullet.count({
    where: { skillId },
  });

  if (usedCount > 0) {
    logger.info(
      "reconcileSkillMutation: immutability path — archiving original and creating new skill",
      { skillId, usedCount },
    );

    // Archive first so the partial unique index (scoped to isArchived = false) never sees
    // two active rows with the same (profileId, name) at once.
    await tx.skill.update({
      where: { id: skillId },
      data: { isArchived: true, isActive: false },
    });

    const newSkill = await tx.skill.create({
      data: {
        profileId,
        name,
        proficiency,
        yearsExperience,
        isActive: true,
        isArchived: false,
      },
    });

    return { action: "archived_and_created", newId: newSkill.id };
  }

  logger.info("reconcileSkillMutation: simple path — in-place update", {
    skillId,
  });

  await tx.skill.update({
    where: { id: skillId },
    data: { name, proficiency, yearsExperience },
  });

  return { action: "updated", newId: skillId };
}
