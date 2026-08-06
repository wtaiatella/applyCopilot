import { prisma } from "./prisma";
import type { BulletTable, CVBulletForeignKey } from "./bulletMutations";

export type ProfileEntityType = "experience" | "project" | "education";

/** Maps an entity type to its bullet table name (for `reconcileBulletMutation()` / tx access). */
export const ENTITY_BULLET_TABLE: Record<ProfileEntityType, BulletTable> = {
  experience: "experienceBullet",
  project: "projectBullet",
  education: "educationBullet",
};

/** Maps an entity type to the `CVBullet` foreign key that references its bullets. */
export const ENTITY_BULLET_FK: Record<ProfileEntityType, CVBulletForeignKey> = {
  experience: "experienceBulletId",
  project: "projectBulletId",
  education: "educationBulletId",
};

/** Maps an entity type to the parent-id field name on its bullet table. */
export const ENTITY_PARENT_FIELD: Record<ProfileEntityType, string> = {
  experience: "experienceId",
  project: "projectId",
  education: "educationId",
};

export interface OwnedEntityBullet {
  id: string;
  text: string;
  type: "BULLET" | "PARAGRAPH";
  sortOrder: number;
  usedInCVs: Array<{ id: string; name: string; jobListingId: string }>;
}

export interface OwnedEntity {
  id: string;
  freeFormContext: string[];
  bullets: OwnedEntityBullet[];
}

/**
 * Loads a profile entity (experience/project/education) by id, verifying it belongs to
 * the authenticated user's profile. Only non-archived bullets are included.
 *
 * @returns `null` if the entity does not exist OR belongs to a different user — callers
 * must respond with a generic 404 in both cases so entity existence is never leaked.
 */
export async function loadOwnedEntity(
  entityType: ProfileEntityType,
  entityId: string,
  userId: string,
): Promise<OwnedEntity | null> {
  const include = {
    profile: true,
    bullets: {
      where: { isArchived: false },
      include: { usedInCVs: { include: { cv: true } } },
      orderBy: { sortOrder: "asc" as const },
    },
  } as const;

  let raw;
  switch (entityType) {
    case "experience":
      raw = await prisma.experience.findUnique({
        where: { id: entityId },
        include,
      });
      break;
    case "project":
      raw = await prisma.project.findUnique({
        where: { id: entityId },
        include,
      });
      break;
    case "education":
      raw = await prisma.education.findUnique({
        where: { id: entityId },
        include,
      });
      break;
  }

  if (!raw || raw.profile.userId !== userId) {
    return null;
  }

  return {
    id: raw.id,
    freeFormContext: raw.freeFormContext,
    bullets: raw.bullets.map((b) => ({
      id: b.id,
      text: b.text,
      type: b.type,
      sortOrder: b.sortOrder,
      usedInCVs: b.usedInCVs.map((uc) => ({
        id: uc.cv.id,
        name: uc.cv.name,
        jobListingId: uc.cv.jobListingId,
      })),
    })),
  };
}
