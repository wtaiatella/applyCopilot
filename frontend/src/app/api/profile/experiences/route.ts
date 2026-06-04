// Profile Experiences API Route
// GET /api/profile/experiences - Get user's work experiences
// POST /api/profile/experiences - Add a new work experience

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import {
  createdResponse,
  successResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { experienceSchema, ExperienceInput } from '@/lib/validation';

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
        experiences: {
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile');
    }

    return successResponse(profile.experiences);
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

    // Validate with Zod
    const validationResult = experienceSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      throw new ValidationError('Invalid input', errors);
    }

    const data: ExperienceInput = validationResult.data;

    // Get or create profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { userId: session.user.id },
      });
    }

    // Create experience
    const experience = await prisma.experience.create({
      data: {
        profileId: profile.id,
        company: data.company,
        position: data.position,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        description: {
          create: (data.bulletPoints || []).map((bp: any) => {
            if (typeof bp === 'string') {
              return {
                text: bp,
                isActive: true,
                type: 'bullet',
                isArchived: false,
                cvIds: [],
              };
            }
            return {
              text: bp.text || '',
              isActive: bp.isActive !== undefined ? bp.isActive : true,
              type: bp.type || 'bullet',
              isArchived: bp.isArchived !== undefined ? bp.isArchived : false,
              cvIds: bp.cvIds || [],
            };
          }),
        },
        technologies: [],
      },
    });

    loggers.app.info('Experience added', {
      userId: session.user.id,
      experienceId: experience.id,
    });

    return createdResponse(experience);
  } catch (error) {
    return handleApiError(error);
  }
}
