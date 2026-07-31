import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type {
  CVSnapshotData,
  CVSnapshotBullet,
  CVSnapshotExperience,
  CVSnapshotEducation,
  CVSnapshotProject,
  CVSnapshotSummary,
  CVSnapshotSkill,
} from "@/types/cv";

/**
 * Clones the full, live Profile (identified by `profileId`) into a fresh `CVSnapshotData`
 * blob for a new CV. Every entity type is mapped to its snapshot counterpart, `sourceXId`
 * always points back to the master Profile row it was cloned from, and every bullet/
 * summary/skill defaults to `included: true` — the whole profile starts fully included;
 * the candidate deselects items during tailoring (FR-2, FR-3, FR-3a).
 *
 * Only non-archived bullets/skills are cloned, mirroring `GET /api/profile`'s own filter —
 * archived rows are historical/soft-deleted and were never visible to the candidate anyway.
 */
export async function buildSnapshotFromProfile(
  profileId: string,
): Promise<CVSnapshotData> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: profileId },
    include: {
      experiences: {
        include: {
          bullets: {
            where: { isArchived: false },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { startDate: "desc" },
      },
      education: {
        include: {
          bullets: {
            where: { isArchived: false },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { startDate: "desc" },
      },
      projects: {
        include: {
          bullets: {
            where: { isArchived: false },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { startDate: "desc" },
      },
      skills: { where: { isArchived: false } },
      summaries: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!profile) {
    throw new Error("No Profile to clone from");
  }

  const mapBullets = (
    bullets: Array<{
      id: string;
      text: string;
      type: "BULLET" | "PARAGRAPH";
      sortOrder: number;
    }>,
  ): CVSnapshotBullet[] =>
    bullets.map((b) => ({
      id: b.id,
      sourceBulletId: b.id,
      text: b.text,
      type: b.type,
      included: true,
      sortOrder: b.sortOrder,
    }));

  const experiences: CVSnapshotExperience[] = profile.experiences.map(
    (exp) => ({
      id: exp.id,
      sourceExperienceId: exp.id,
      company: exp.company,
      position: exp.position,
      startDate: exp.startDate.toISOString(),
      endDate: exp.endDate ? exp.endDate.toISOString() : null,
      current: exp.current,
      tabLabel: exp.tabLabel ?? null,
      freeFormContext: exp.freeFormContext,
      bullets: mapBullets(exp.bullets),
    }),
  );

  const education: CVSnapshotEducation[] = profile.education.map((edu) => ({
    id: edu.id,
    sourceEducationId: edu.id,
    institution: edu.institution,
    degree: edu.degree,
    fieldOfStudy: edu.fieldOfStudy,
    startDate: edu.startDate.toISOString(),
    endDate: edu.endDate ? edu.endDate.toISOString() : null,
    current: edu.current,
    hideEndDate: edu.hideEndDate,
    tabLabel: edu.tabLabel ?? null,
    freeFormContext: edu.freeFormContext,
    bullets: mapBullets(edu.bullets),
  }));

  const projects: CVSnapshotProject[] = profile.projects.map((proj) => ({
    id: proj.id,
    sourceProjectId: proj.id,
    name: proj.name,
    startDate: proj.startDate ? proj.startDate.toISOString() : null,
    endDate: proj.endDate ? proj.endDate.toISOString() : null,
    current: proj.current,
    technologies: proj.technologies,
    tabLabel: proj.tabLabel ?? null,
    freeFormContext: proj.freeFormContext,
    bullets: mapBullets(proj.bullets),
  }));

  const summaries: CVSnapshotSummary[] = profile.summaries.map((sum) => ({
    id: sum.id,
    sourceSummaryId: sum.id,
    title: sum.title,
    content: sum.content,
    isAIGenerated: sum.isAIGenerated,
    included: true,
  }));

  const skills: CVSnapshotSkill[] = profile.skills.map((s) => ({
    id: s.id,
    sourceSkillId: s.id,
    name: s.name,
    proficiency: s.proficiency,
    yearsExperience: s.yearsExperience,
    included: true,
  }));

  logger.info("cv_snapshot_built", {
    profileId,
    experienceCount: experiences.length,
    educationCount: education.length,
    projectCount: projects.length,
    summaryCount: summaries.length,
    skillCount: skills.length,
  });

  return {
    version: 1,
    basicData: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      website: profile.website,
      title: profile.title,
    },
    summaries,
    experiences,
    education,
    projects,
    skills,
  };
}
