import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";
import { 
  BasicDataDTO, 
  ExperienceDTO, 
  EducationDTO, 
  ProjectDTO,
  SkillDTO, 
  ProficiencyLevel, 
  BulletType 
} from "../../types/profile";



export class ProfileMergeService {
  /**
   * Normalizes a string by converting it to lowercase, trimming whitespace,
   * and removing all non-alphanumeric and non-space characters.
   */
  static normalizeText(text: string): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ""); // Keep alphanumeric and spaces
  }

  /**
   * Merge basic data into UserProfile.
   *
   * When the incoming data contains a summary (from CV import), this method also
   * creates or reuses a ProfileSummary entry so the imported content is preserved
   * in the summaries list and does not get silently overwritten when the user
   * later activates a different summary.
   *
   * Merge logic for the summary:
   *  - If a ProfileSummary with identical content already exists → skip creation
   *    (idempotent re-import)
   *  - Otherwise → create a new ProfileSummary marked as active, and deactivate
   *    all other summaries so there is always exactly one active summary after import
   */
  static async mergeBasicData(profileId: string, incoming: Partial<BasicDataDTO>): Promise<void> {
    logger.info(`Merging basic data for profile: ${profileId}`);
    
    const updateData: Record<string, string | null> = {};
    
    if (incoming.firstName) updateData.firstName = incoming.firstName;
    if (incoming.lastName) updateData.lastName = incoming.lastName;
    if (incoming.phone) updateData.phone = incoming.phone;
    if (incoming.location) updateData.location = incoming.location;
    if (incoming.linkedin) updateData.linkedin = incoming.linkedin;
    if (incoming.github) updateData.github = incoming.github;
    if (incoming.website) updateData.website = incoming.website;

    // If the CV brought a summary/title, incorporate it into the ProfileSummary list
    if (incoming.summary && incoming.title) {
      const normalizedContent = this.normalizeText(incoming.summary);

      // Check if an equivalent summary already exists (idempotent re-import)
      const existingSummaries = await prisma.profileSummary.findMany({
        where: { profileId },
      });

      const duplicate = existingSummaries.find(
        (s) => this.normalizeText(s.content) === normalizedContent
      );

      if (!duplicate) {
        logger.info(`CV import: creating ProfileSummary entry from imported title/summary for profile ${profileId}`);

        // Deactivate all existing summaries so this import becomes the active one
        if (existingSummaries.length > 0) {
          await prisma.profileSummary.updateMany({
            where: { profileId },
            data: { isActive: false },
          });
        }

        const nextSortOrder = existingSummaries.length;
        await prisma.profileSummary.create({
          data: {
            profileId,
            title: incoming.title,
            content: incoming.summary,
            isAIGenerated: false,
            isActive: true,
            sortOrder: nextSortOrder,
          },
        });
      } else if (!duplicate.isActive) {
        // Summary already exists but was not active — activate it and deactivate others
        logger.info(`CV import: re-activating existing ProfileSummary ${duplicate.id} for profile ${profileId}`);
        await prisma.profileSummary.updateMany({
          where: { profileId },
          data: { isActive: false },
        });
        await prisma.profileSummary.update({
          where: { id: duplicate.id },
          data: { isActive: true },
        });
      }

      // Always sync the flat fields from the incoming CV data
      updateData.title = incoming.title;
      updateData.summary = incoming.summary;
    } else {
      // No summary in this import — still sync other flat fields as before
      if (incoming.title) updateData.title = incoming.title;
      if (incoming.summary) updateData.summary = incoming.summary;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.userProfile.update({
        where: { id: profileId },
        data: updateData,
      });
    }
  }

  /**
   * Merge experiences list
   */
  static async mergeExperiences(profileId: string, incoming: Partial<ExperienceDTO>[]): Promise<void> {
    logger.info(`Merging experiences for profile: ${profileId}`);

    for (const incExp of incoming) {
      if (!incExp.company) continue;

      const normCompany = this.normalizeText(incExp.company);

      // Find existing experiences matching this company (match key: company only, per spec).
      // Rationale: same company / different position should not create a duplicate company entry;
      // new positions are appended as new experiences under the same company.
      const existingExps = await prisma.experience.findMany({
        where: { profileId },
        include: { bullets: true },
      });

      // Match by normalized company only
      const exactMatch = existingExps.find(
        (e) => this.normalizeText(e.company) === normCompany
      );

      const startDate = incExp.startDate ? new Date(incExp.startDate) : new Date();
      const endDate = incExp.endDate ? new Date(incExp.endDate) : null;
      const current = incExp.current ?? false;

      if (exactMatch) {
        // Merge freeFormContext arrays (union, deduplicating by normalized text)
        const mergedContext = [
          ...exactMatch.freeFormContext,
          ...(incExp.freeFormContext ?? []).filter(
            (c) => !exactMatch.freeFormContext.some((e) => this.normalizeText(e) === this.normalizeText(c))
          ),
        ];

        await prisma.experience.update({
          where: { id: exactMatch.id },
          data: {
            startDate: incExp.startDate ? startDate : exactMatch.startDate,
            endDate: incExp.endDate !== undefined ? endDate : exactMatch.endDate,
            current: incExp.current !== undefined ? current : exactMatch.current,
            freeFormContext: mergedContext,
          },
        });

        // Merge experience bullets
        if (incExp.bullets && incExp.bullets.length > 0) {
          await this.mergeBullets(
            exactMatch.bullets,
            incExp.bullets,
            async (text, type, sortOrder) => {
              await prisma.experienceBullet.create({
                data: {
                  experienceId: exactMatch.id,
                  text,
                  type,
                  sortOrder,
                },
              });
            },
            async (id, isArchived) => {
              await prisma.experienceBullet.update({
                where: { id },
                data: { isArchived },
              });
            }
          );
        }
      } else {
        // No exact match, create a new Experience record
        const newExp = await prisma.experience.create({
          data: {
            profileId,
            company: incExp.company,
            position: incExp.position || "Staff",
            startDate,
            endDate,
            current,
            freeFormContext: incExp.freeFormContext ?? [],
          },
        });

        // Create experience bullets
        if (incExp.bullets && incExp.bullets.length > 0) {
          for (const [idx, b] of incExp.bullets.entries()) {
            await prisma.experienceBullet.create({
              data: {
                experienceId: newExp.id,
                text: b.text,
                type: (b.type as BulletType) || "BULLET",
                sortOrder: b.sortOrder ?? idx,
              },
            });
          }
        }
      }
    }
  }

  /**
   * Merge projects list — called during CV import for explicitly listed projects only.
   * The AI fallback that inferred projects from work experiences was removed;
   * users can generate project suggestions manually via the profile page.
   */
  static async mergeProjects(profileId: string, incoming: Partial<ProjectDTO>[]): Promise<void> {
    logger.info(`Merging projects for profile: ${profileId}`);

    for (const incProj of incoming) {
      if (!incProj.name) continue;

      const normName = this.normalizeText(incProj.name);

      const existingProjs = await prisma.project.findMany({
        where: { profileId },
        include: { bullets: true },
      });

      const match = existingProjs.find((p) => this.normalizeText(p.name) === normName);

      const startDate = incProj.startDate ? new Date(incProj.startDate) : null;
      const endDate = incProj.endDate ? new Date(incProj.endDate) : null;
      const current = incProj.current ?? false;
      const technologies = incProj.technologies ?? [];

      if (match) {
        // Merge technologies (union arrays)
        const combinedTech = Array.from(new Set([...match.technologies, ...technologies]));

        const mergedProjContext = [
          ...match.freeFormContext,
          ...(incProj.freeFormContext ?? []).filter(
            (c) => !match.freeFormContext.some((e) => this.normalizeText(e) === this.normalizeText(c))
          ),
        ];

        await prisma.project.update({
          where: { id: match.id },
          data: {
            startDate: incProj.startDate ? startDate : match.startDate,
            endDate: incProj.endDate !== undefined ? endDate : match.endDate,
            current: incProj.current !== undefined ? current : match.current,
            technologies: combinedTech,
            freeFormContext: mergedProjContext,
          },
        });

        if (incProj.bullets && incProj.bullets.length > 0) {
          await this.mergeBullets(
            match.bullets,
            incProj.bullets,
            async (text, type, sortOrder) => {
              await prisma.projectBullet.create({
                data: { projectId: match.id, text, type, sortOrder },
              });
            },
            async (id, isArchived) => {
              await prisma.projectBullet.update({
                where: { id },
                data: { isArchived },
              });
            }
          );
        }
      } else {
        const newProj = await prisma.project.create({
          data: {
            profileId,
            name: incProj.name,
            startDate,
            endDate,
            current,
            technologies,
            freeFormContext: incProj.freeFormContext ?? [],
          },
        });

        if (incProj.bullets && incProj.bullets.length > 0) {
          for (const [idx, b] of incProj.bullets.entries()) {
            await prisma.projectBullet.create({
              data: {
                projectId: newProj.id,
                text: b.text,
                type: (b.type as BulletType) || "BULLET",
                sortOrder: b.sortOrder ?? idx,
              },
            });
          }
        }
      }
    }
  }

  /**
   * Merge education list
   */
  static async mergeEducation(profileId: string, incoming: Partial<EducationDTO>[]): Promise<void> {
    logger.info(`Merging education for profile: ${profileId}`);

    for (const incEd of incoming) {
      if (!incEd.institution || !incEd.degree) continue;

      const normInst = this.normalizeText(incEd.institution);
      const normDeg = this.normalizeText(incEd.degree);

      const existingEds = await prisma.education.findMany({
        where: { profileId },
        include: { bullets: true },
      });

      const match = existingEds.find(
        (e) => this.normalizeText(e.institution) === normInst && this.normalizeText(e.degree) === normDeg
      );

      const startDate = incEd.startDate ? new Date(incEd.startDate) : new Date();
      const endDate = incEd.endDate ? new Date(incEd.endDate) : null;
      const current = incEd.current ?? false;
      const hideEndDate = incEd.hideEndDate ?? false;
      const freeFormContext = incEd.freeFormContext ?? null;
      const fieldOfStudy = incEd.fieldOfStudy ?? null;

      if (match) {
        const mergedEdContext = [
          ...match.freeFormContext,
          ...(incEd.freeFormContext ?? []).filter(
            (c) => !match.freeFormContext.some((e) => this.normalizeText(e) === this.normalizeText(c))
          ),
        ];

        await prisma.education.update({
          where: { id: match.id },
          data: {
            fieldOfStudy: incEd.fieldOfStudy || match.fieldOfStudy,
            startDate: incEd.startDate ? startDate : match.startDate,
            endDate: incEd.endDate !== undefined ? endDate : match.endDate,
            current: incEd.current !== undefined ? current : match.current,
            hideEndDate: incEd.hideEndDate !== undefined ? hideEndDate : match.hideEndDate,
            freeFormContext: mergedEdContext,
          },
        });

        if (incEd.bullets && incEd.bullets.length > 0) {
          await this.mergeBullets(
            match.bullets,
            incEd.bullets,
            async (text, type, sortOrder) => {
              await prisma.educationBullet.create({
                data: {
                  educationId: match.id,
                  text,
                  type,
                  sortOrder,
                },
              });
            },
            async (id, isArchived) => {
              await prisma.educationBullet.update({
                where: { id },
                data: { isArchived },
              });
            }
          );
        }
      } else {
        const newEd = await prisma.education.create({
          data: {
            profileId,
            institution: incEd.institution,
            degree: incEd.degree,
            fieldOfStudy,
            startDate,
            endDate,
            current,
            hideEndDate,
            freeFormContext: incEd.freeFormContext ?? [],
          },
        });

        if (incEd.bullets && incEd.bullets.length > 0) {
          for (const [idx, b] of incEd.bullets.entries()) {
            await prisma.educationBullet.create({
              data: {
                educationId: newEd.id,
                text: b.text,
                type: (b.type as BulletType) || "BULLET",
                sortOrder: b.sortOrder ?? idx,
              },
            });
          }
        }
      }
    }
  }

  /**
   * Merge skills list
   */
  static async mergeSkills(profileId: string, incoming: Partial<SkillDTO>[]): Promise<void> {
    logger.info(`Merging skills for profile: ${profileId}`);

    const proficiencyMap: Record<ProficiencyLevel, number> = {
      BEGINNER: 1,
      INTERMEDIATE: 2,
      ADVANCED: 3,
      EXPERT: 4,
    };

    const reverseProficiencyMap: Record<number, ProficiencyLevel> = {
      1: "BEGINNER",
      2: "INTERMEDIATE",
      3: "ADVANCED",
      4: "EXPERT",
    };

    for (const incSkill of incoming) {
      if (!incSkill.name) continue;

      const normName = this.normalizeText(incSkill.name);

      const existingSkills = await prisma.skill.findMany({
        where: { profileId },
      });

      const match = existingSkills.find((s) => this.normalizeText(s.name) === normName);
      
      const yearsExperience = incSkill.yearsExperience ?? null;
      const proficiency = incSkill.proficiency ?? "INTERMEDIATE";

      if (match) {
        // Keep the higher proficiency
        const existingVal = proficiencyMap[match.proficiency as ProficiencyLevel] || 2;
        const incomingVal = proficiencyMap[proficiency as ProficiencyLevel] || 2;
        const finalProficiency = reverseProficiencyMap[Math.max(existingVal, incomingVal)];

        // Keep the higher years of experience
        const finalYears = Math.max(match.yearsExperience ?? 0, yearsExperience ?? 0) || null;

        await prisma.skill.update({
          where: { id: match.id },
          data: {
            proficiency: finalProficiency,
            yearsExperience: finalYears,
          },
        });
      } else {
        await prisma.skill.create({
          data: {
            profileId,
            name: incSkill.name,
            proficiency,
            yearsExperience,
          },
        });
      }
    }
  }

  /**
   * Centralized helper to merge bullet items
   */
  private static async mergeBullets(
    existingBullets: Array<{ id: string; text: string; isArchived: boolean }>,
    incomingBullets: Partial<{ text: string; type: string; sortOrder: number }>[],
    createFn: (text: string, type: BulletType, sortOrder: number) => Promise<void>,
    setArchiveFn: (id: string, isArchived: boolean) => Promise<void>
  ): Promise<void> {
    for (const [idx, incB] of incomingBullets.entries()) {
      if (!incB.text) continue;

      const normText = this.normalizeText(incB.text);
      const match = existingBullets.find((b) => this.normalizeText(b.text) === normText);

      if (match) {
        // Rule: If matching bullet is archived, unarchive it!
        if (match.isArchived) {
          logger.info(`Reactivating archived bullet: ${match.id}`);
          await setArchiveFn(match.id, false);
        }
      } else {
        // Create new bullet
        await createFn(
          incB.text,
          (incB.type as BulletType) || "BULLET",
          incB.sortOrder ?? idx
        );
      }
    }
  }

}
