// Profile Experience Detail API Route
// GET /api/profile/experiences/[id] - Get a specific experience
// PUT /api/profile/experiences/[id] - Update an experience
// DELETE /api/profile/experiences/[id] - Delete an experience

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import {
  successResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { experienceSchema, ExperienceInput } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const experience = await prisma.experience.findUnique({
      where: { id: params.id },
      include: {
        profile: true,
      },
    });

    if (!experience) {
      throw new NotFoundError('Experience');
    }

    // Check ownership
    if (experience.profile.userId !== session.user.id) {
      throw new ForbiddenError();
    }

    return successResponse(experience);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Check ownership
    const existing = await prisma.experience.findUnique({
      where: { id: params.id },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundError('Experience');
    }

    if (existing.profile.userId !== session.user.id) {
      throw new ForbiddenError();
    }

    // Update experience
    const experience = await prisma.experience.update({
      where: { id: params.id },
      data: {
        ...(data.company !== undefined && { company: data.company }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.bulletPoints !== undefined && { description: data.bulletPoints }),
      },
    });

    loggers.app.info('Experience updated', {
      userId: session.user.id,
      experienceId: experience.id,
    });

    return successResponse(experience);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Check ownership
    const existing = await prisma.experience.findUnique({
      where: { id: params.id },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundError('Experience');
    }

    if (existing.profile.userId !== session.user.id) {
      throw new ForbiddenError();
    }

    // Delete experience
    await prisma.experience.delete({
      where: { id: params.id },
    });

    loggers.app.info('Experience deleted', {
      userId: session.user.id,
      experienceId: params.id,
    });

    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
