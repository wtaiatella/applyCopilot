// Profile API Route
// GET /api/profile - Get complete user profile
// POST /api/profile - Create or update complete profile

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import {
  successResponse,
  createdResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new ValidationError('Unauthorized');
    }

    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
          },
        },
        experiences: {
          orderBy: { startDate: 'desc' },
        },
        education: {
          orderBy: { startDate: 'desc' },
        },
        projects: {
          orderBy: { startDate: 'desc' },
        },
        skills: {
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        references: {
          orderBy: { name: 'asc' },
        },
        summaries: {
          where: { isActive: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile');
    }

    return successResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new ValidationError('Unauthorized');
    }

    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();

    // Upsert profile with basic fields first
    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        ...(body.basicData?.title !== undefined && { title: body.basicData.title }),
        ...(body.basicData?.location !== undefined && { location: body.basicData.location }),
        ...(body.basicData?.phone !== undefined && { phone: body.basicData.phone }),
        ...(body.basicData?.website !== undefined && { website: body.basicData.website }),
        ...(body.basicData?.github !== undefined && { github: body.basicData.github }),
        ...(body.basicData?.firstName !== undefined && { firstName: body.basicData.firstName }),
        ...(body.basicData?.lastName !== undefined && { lastName: body.basicData.lastName }),
        processingStatus: 'COMPLETED',
      },
      create: {
        userId: session.user.id,
        firstName: body.basicData?.firstName || session.user.name?.split(' ')[0] || 'User',
        lastName: body.basicData?.lastName || session.user.name?.split(' ').slice(1).join(' ') || '',
        title: body.basicData?.title || null,
        location: body.basicData?.location || null,
        phone: body.basicData?.phone || null,
        website: body.basicData?.website || null,
        github: body.basicData?.github || null,
        processingStatus: 'COMPLETED',
      },
    });

    // Update related collections if provided in the body
    if (body.experiences) {
      await prisma.experience.deleteMany({ where: { profileId: profile.id } });
      if (body.experiences.length > 0) {
        await prisma.experience.createMany({
          data: body.experiences.map((exp: any) => ({
            profileId: profile.id,
            company: exp.company || 'Unknown Company',
            position: exp.position || 'Unknown Position',
            startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
            endDate: exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : null,
            current: exp.current || exp.endDate === 'Present' || false,
            description: exp.bulletPoints || [],
            freeFormContext: exp.freeFormContext || '',
          })),
        });
      }
    }

    if (body.education) {
      await prisma.education.deleteMany({ where: { profileId: profile.id } });
      if (body.education.length > 0) {
        await prisma.education.createMany({
          data: body.education.map((edu: any) => ({
            profileId: profile.id,
            institution: edu.institution || 'Unknown Institution',
            degree: edu.degree || '',
            field: edu.field || '',
            startDate: edu.startDate ? new Date(edu.startDate) : new Date(),
            endDate: edu.endDate && edu.endDate !== 'Present' ? new Date(edu.endDate) : null,
            current: edu.current || edu.endDate === 'Present' || false,
            description: edu.bulletPoints || [],
            freeFormContext: edu.freeFormContext || '',
          })),
        });
      }
    }

    if (body.projects) {
      await prisma.project.deleteMany({ where: { profileId: profile.id } });
      if (body.projects.length > 0) {
        await prisma.project.createMany({
          data: body.projects.map((proj: any) => ({
            profileId: profile.id,
            name: proj.name,
            description: proj.bulletPoints || [],
            bulletPoints: proj.bulletPoints || [],
            startDate: new Date(proj.startDate),
            endDate: proj.endDate && proj.endDate !== 'Present' ? new Date(proj.endDate) : null,
            technologies: proj.technologies || [],
            freeFormContext: proj.freeFormContext || '',
          })),
        });
      }
    }

    if (body.skills) {
      console.log(`Saving ${body.skills.length} skills for profile ${profile.id}`);
      await prisma.skill.deleteMany({ where: { profileId: profile.id } });
      if (body.skills.length > 0) {
        await prisma.skill.createMany({
          data: body.skills.map((skill: any) => ({
            profileId: profile.id,
            name: skill.name || 'Unknown Skill',
            category: skill.category || 'TECHNICAL',
            proficiency: skill.level || skill.proficiency || 'INTERMEDIATE',
            yearsExperience: typeof skill.yearsOfExperience === 'number' ? skill.yearsOfExperience : 
                            (typeof skill.yearsExperience === 'number' ? skill.yearsExperience : null),
          })),
        });
      }
    }

    if (body.references) {
      await prisma.reference.deleteMany({ where: { profileId: profile.id } });
      if (body.references.length > 0) {
        await prisma.reference.createMany({
          data: body.references.map((ref: any) => ({
            profileId: profile.id,
            name: ref.name,
            relationship: ref.relationship,
            email: ref.email || null,
            phone: ref.phone || null,
            company: ref.company || null,
            notes: ref.notes || null,
            canContact: ref.canContact || false,
          })),
        });
      }
    }

    loggers.app.info('Profile created/updated', {
      userId: session.user.id,
      profileId: profile.id,
    });

    return createdResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
