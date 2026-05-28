// AI-Powered CV Parsing Pipeline
// Orchestrates the complete CV processing workflow:
// 1. File upload and validation
// 2. Text extraction (PDF/DOCX)
// 3. AI-powered structured data extraction
// 4. Profile creation/update in database

import { CVParser, ParsedCVData } from './cv-parser';
import prisma from '@/lib/prisma';
import { loggers } from '@/lib/logging';
import { ProcessingStatus, SkillCategory, ProficiencyLevel } from '@prisma/client';

export interface CVPipelineResult {
  profileId: string;
  extractedData: ParsedCVData;
  processingStatus: ProcessingStatus;
  warnings?: string[];
}

export class CVPipeline {
  /**
   * Complete CV processing pipeline
   */
  static async processCV(
    userId: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<CVPipelineResult> {
    const warnings: string[] = [];

    try {
      loggers.app.info('CV pipeline started', { userId, mimeType });

      // Step 1: Extract text and parse with AI
      const { extraction, parsedData } = await CVParser.processCV(buffer, mimeType);

      loggers.ai.info('CV data extracted', {
        userId,
        format: extraction.format,
        textLength: extraction.text.length,
      });

      // Step 2: Get or create user profile
      let profile = await prisma.userProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        profile = await prisma.userProfile.create({
          data: {
            userId,
            processingStatus: 'PROCESSING',
          },
        });
        loggers.app.info('Profile created', { userId, profileId: profile.id });
      } else {
        // Update processing status
        profile = await prisma.userProfile.update({
          where: { id: profile.id },
          data: { processingStatus: 'PROCESSING' },
        });
      }

      // Step 3: Update basic data
      await this.updateBasicData(profile.id, parsedData);

      // Step 4: Create/update experiences
      await this.syncExperiences(profile.id, parsedData.experiences);

      // Step 5: Create/update education
      await this.syncEducation(profile.id, parsedData.education);

      // Step 6: Create/update projects
      await this.syncProjects(profile.id, parsedData.projects);

      // Step 7: Create/update skills
      await this.syncSkills(profile.id, parsedData.skills);

      // Step 8: Create AI-generated summary
      await this.createAISummary(profile.id, parsedData);

      // Step 9: Mark as completed
      profile = await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          processingStatus: 'COMPLETED',
          updatedAt: new Date(),
        },
      });

      loggers.app.info('CV pipeline completed', {
        userId,
        profileId: profile.id,
        processingStatus: profile.processingStatus,
      });

      return {
        profileId: profile.id,
        extractedData: parsedData,
        processingStatus: profile.processingStatus,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      loggers.app.error('CV pipeline failed', {
        userId,
        error: (error as Error).message,
      });

      // Mark as failed if profile exists
      try {
        const profile = await prisma.userProfile.findUnique({
          where: { userId },
        });
        if (profile) {
          await prisma.userProfile.update({
            where: { id: profile.id },
            data: { processingStatus: 'FAILED' },
          });
        }
      } catch (updateError) {
        loggers.app.error('Failed to update profile status to FAILED', {
          userId,
          error: (updateError as Error).message,
        });
      }

      throw error;
    }
  }

  /**
   * Update basic profile data
   */
  private static async updateBasicData(
    profileId: string,
    parsedData: ParsedCVData
  ): Promise<void> {
    const { basicData } = parsedData;

    if (!basicData.firstName && !basicData.lastName) {
      return;
    }

    await prisma.userProfile.update({
      where: { id: profileId },
      data: {
        title: basicData.firstName && basicData.lastName 
          ? `${basicData.firstName} ${basicData.lastName}` 
          : undefined,
        summary: basicData.location || undefined,
        location: basicData.location || undefined,
        phone: basicData.phone || undefined,
      },
    });
  }

  /**
   * Sync experiences (delete old, create new)
   */
  private static async syncExperiences(
    profileId: string,
    experiences: ParsedCVData['experiences']
  ): Promise<void> {
    // Delete existing experiences
    await prisma.experience.deleteMany({
      where: { profileId },
    });

    // Create new experiences
    for (const exp of experiences) {
      await prisma.experience.create({
        data: {
          profileId,
          company: exp.company,
          position: exp.position,
          startDate: new Date(exp.startDate),
          endDate: exp.endDate ? new Date(exp.endDate) : null,
          current: exp.current,
          description: {
            create: (exp.description || []).map((text) => ({
              text,
              isActive: true,
              type: 'bullet',
              isArchived: false,
              cvIds: [],
            })),
          },
          technologies: [],
        },
      });
    }
  }

  /**
   * Sync education (delete old, create new)
   */
  private static async syncEducation(
    profileId: string,
    education: ParsedCVData['education']
  ): Promise<void> {
    // Delete existing education
    await prisma.education.deleteMany({
      where: { profileId },
    });

    // Create new education entries
    for (const edu of education) {
      await prisma.education.create({
        data: {
          profileId,
          institution: edu.institution,
          degree: edu.degree,
          field: edu.field,
          startDate: new Date(edu.startDate),
          endDate: edu.endDate ? new Date(edu.endDate) : null,
          current: edu.current,
          achievements: [],
        },
      });
    }
  }

  /**
   * Sync projects (delete old, create new)
   */
  private static async syncProjects(
    profileId: string,
    projects: ParsedCVData['projects']
  ): Promise<void> {
    // Delete existing projects
    await prisma.project.deleteMany({
      where: { profileId },
    });

    // Create new projects
    for (const proj of projects) {
      await prisma.project.create({
        data: {
          profileId,
          name: proj.name,
          description: proj.description || [],
          bulletPoints: {
            create: (proj.description || []).map((text) => ({
              text,
              isActive: true,
              type: 'bullet',
              isArchived: false,
              cvIds: [],
            })),
          },
          technologies: proj.technologies,
          startDate: new Date(), // CV parsing may not have project dates
          endDate: null,
        },
      });
    }
  }

  /**
   * Sync skills (delete old, create new)
   */
  private static async syncSkills(
    profileId: string,
    skills: ParsedCVData['skills']
  ): Promise<void> {
    // Delete existing skills
    await prisma.skill.deleteMany({
      where: { profileId },
    });

    // Create new skills
    for (const skill of skills) {
      await prisma.skill.create({
        data: {
          profileId,
          name: skill.name,
          category: this.mapSkillCategory(skill.category),
          proficiency: this.mapProficiencyLevel(skill.proficiency),
        },
      });
    }
  }

  /**
   * Create AI-generated summary
   */
  private static async createAISummary(
    profileId: string,
    parsedData: ParsedCVData
  ): Promise<void> {
    // Generate a summary from the parsed data
    const summaryText = this.generateSummaryText(parsedData);

    // Create or update summary
    await prisma.profileSummary.create({
      data: {
        profileId,
        title: 'AI Generated Summary',
        content: summaryText,
        isAIGenerated: true,
        isActive: true,
      },
    });
  }

  /**
   * Generate summary text from parsed data
   */
  private static generateSummaryText(parsedData: ParsedCVData): string {
    const { basicData, experiences, skills } = parsedData;

    const parts: string[] = [];

    if (basicData.firstName || basicData.lastName) {
      parts.push(`Professional profile of ${basicData.firstName || ''} ${basicData.lastName || ''}`);
    }

    if (experiences.length > 0) {
      const companies = experiences.map(e => e.company).join(', ');
      parts.push(`Experience at ${companies}`);
    }

    if (skills.length > 0) {
      const skillNames = skills.map(s => s.name).slice(0, 10).join(', ');
      parts.push(`Skills include ${skillNames}`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Map skill category from AI output to Prisma enum
   */
  private static mapSkillCategory(category: string): SkillCategory {
    const normalized = category.toLowerCase();
    
    if (normalized.includes('technical') || normalized.includes('programming') || normalized.includes('framework')) {
      return SkillCategory.TECHNICAL;
    }
    if (normalized.includes('soft') || normalized.includes('communication') || normalized.includes('leadership')) {
      return SkillCategory.SOFT_SKILL;
    }
    if (normalized.includes('language')) {
      return SkillCategory.LANGUAGE;
    }
    if (normalized.includes('framework') || normalized.includes('library')) {
      return SkillCategory.FRAMEWORK;
    }
    if (normalized.includes('tool') || normalized.includes('software')) {
      return SkillCategory.TOOL;
    }
    
    return SkillCategory.DOMAIN;
  }

  /**
   * Map proficiency level from AI output to Prisma enum
   */
  private static mapProficiencyLevel(proficiency: string): ProficiencyLevel {
    const normalized = proficiency.toLowerCase();
    
    if (normalized.includes('expert') || normalized.includes('master')) {
      return ProficiencyLevel.EXPERT;
    }
    if (normalized.includes('advanced') || normalized.includes('senior')) {
      return ProficiencyLevel.ADVANCED;
    }
    if (normalized.includes('intermediate') || normalized.includes('mid')) {
      return ProficiencyLevel.INTERMEDIATE;
    }
    
    return ProficiencyLevel.BEGINNER;
  }
}
