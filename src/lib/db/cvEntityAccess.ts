import { prisma } from "./prisma";
import type { CVSnapshotData, CVSnapshotBullet } from "@/types/cv";
import type { AIJobContext } from "@/services/profileBulletAIService";
import type { CV, JobListing } from "@prisma/client";

export type CVEntityType = "experience" | "project" | "education";

/** A loaded, ownership-verified CV row (with its `jobListing` for job-aware AI context). */
export type OwnedCV = CV & { jobListing: JobListing };

/**
 * Loads a CV by id, verifying it belongs to the authenticated user's profile.
 *
 * @returns `null` if the CV does not exist OR belongs to a different user — callers must
 * respond with a generic 404 in both cases so CV existence is never leaked.
 */
export async function loadOwnedCV(
  cvId: string,
  userId: string,
): Promise<OwnedCV | null> {
  const cv = await prisma.cV.findUnique({
    where: { id: cvId },
    include: { profile: true, jobListing: true },
  });

  if (!cv || cv.profile.userId !== userId) {
    return null;
  }

  return cv;
}

/**
 * Builds the vendor-agnostic `AIJobContext` DTO for a CV's linked job, including the cached
 * Deep Analysis (weaknesses/missingSkills) when one exists. When no Deep Analysis has been run
 * yet, `weaknesses`/`missingSkills` are simply omitted (FR-10 reduced-context mode) — the AI
 * service functions treat their absence as "not available", not an empty result.
 */
export async function buildCVJobContext(cv: OwnedCV): Promise<AIJobContext> {
  const analysis = await prisma.jobAnalysis.findUnique({
    where: {
      profileId_jobId: { profileId: cv.profileId, jobId: cv.jobListingId },
    },
  });

  return {
    jobTitle: cv.jobListing.title,
    company: cv.jobListing.company,
    jobDescription: cv.jobListing.fullDescription,
    ...(analysis
      ? {
          weaknesses: analysis.weaknesses,
          missingSkills: analysis.missingSkills,
        }
      : {}),
  };
}

export interface SnapshotEntity {
  bullets: CVSnapshotBullet[];
  freeFormContext: string[];
}

/**
 * Finds an experience/project/education entity by its snapshot-local id within a CV's own
 * `snapshotData` — never a Prisma lookup, since these ids only exist inside the JSON blob.
 * Returns `null` when the entity is not present in this CV's snapshot.
 */
export function findSnapshotEntity(
  snapshot: CVSnapshotData,
  entityType: CVEntityType,
  entityId: string,
): SnapshotEntity | null {
  const pool =
    entityType === "experience"
      ? snapshot.experiences
      : entityType === "project"
        ? snapshot.projects
        : snapshot.education;

  const entity = pool.find((e) => e.id === entityId);
  if (!entity) return null;

  return { bullets: entity.bullets, freeFormContext: entity.freeFormContext };
}
