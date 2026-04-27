// Profile Basic Data API Route
// GET /api/profile/basic-data - Get user's basic profile data
// PUT /api/profile/basic-data - Update user's basic profile data

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import {
  successResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

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
            email: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundError('Profile');
    }

    return successResponse({
      id: profile.id,
      title: profile.title,
      summary: profile.summary,
      location: profile.location,
      phone: profile.phone,
      website: profile.website,
      user: profile.user,
      processingStatus: profile.processingStatus,
      updatedAt: profile.updatedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
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
    const basicDataSchema = z.object({
      title: z.string().optional(),
      summary: z.string().optional(),
      location: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
    });

    const validationResult = basicDataSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      throw new ValidationError('Invalid input', errors);
    }

    const data = validationResult.data;

    // Upsert profile
    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        title: data.title,
        summary: data.summary,
        location: data.location,
        phone: data.phone,
        website: data.website,
      },
      create: {
        userId: session.user.id,
        title: data.title,
        summary: data.summary,
        location: data.location,
        phone: data.phone,
        website: data.website,
      },
    });

    loggers.app.info('Profile basic data updated', {
      userId: session.user.id,
      profileId: profile.id,
    });

    return successResponse({
      id: profile.id,
      title: profile.title,
      summary: profile.summary,
      location: profile.location,
      phone: profile.phone,
      website: profile.website,
      updatedAt: profile.updatedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
