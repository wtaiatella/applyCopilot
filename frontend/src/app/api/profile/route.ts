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

    // Upsert profile with all sections
    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.summary !== undefined && { summary: body.summary }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.website !== undefined && { website: body.website }),
        processingStatus: 'COMPLETED',
      },
      create: {
        userId: session.user.id,
        title: body.title || null,
        summary: body.summary || null,
        location: body.location || null,
        phone: body.phone || null,
        website: body.website || null,
        processingStatus: 'COMPLETED',
      },
    });

    loggers.app.info('Profile created/updated', {
      userId: session.user.id,
      profileId: profile.id,
    });

    return createdResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
