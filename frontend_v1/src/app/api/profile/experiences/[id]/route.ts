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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      where: { id },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      where: { id },
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
      where: { id },
      data: {
        ...(data.company !== undefined && { company: data.company }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
      },
    });

    if (data.bulletPoints !== undefined) {
      const existingBullets = await prisma.experienceBullet.findMany({
        where: { experienceId: experience.id }
      });

      const incomingBullets = data.bulletPoints.map((bp: any) => {
        if (typeof bp === 'string') {
          return {
            text: bp,
            isActive: true,
            type: 'bullet',
          };
        }
        return bp;
      });

      const incomingBulletIds = new Set<string>();
      for (const bp of incomingBullets) {
        if (bp.id && bp.id.match(/^[0-9a-fA-F]{24}$/)) {
          incomingBulletIds.add(bp.id);
          await prisma.experienceBullet.update({
            where: { id: bp.id },
            data: {
              text: bp.text || '',
              isActive: bp.isActive !== undefined ? bp.isActive : true,
              type: bp.type || 'bullet',
            }
          });
        } else {
          const created = await prisma.experienceBullet.create({
            data: {
              experienceId: experience.id,
              text: bp.text || '',
              isActive: bp.isActive !== undefined ? bp.isActive : true,
              type: bp.type || 'bullet',
              isArchived: false,
              cvIds: [],
            }
          });
          incomingBulletIds.add(created.id);
        }
      }

      const deletedBullets = existingBullets.filter(eb => !eb.isArchived && !incomingBulletIds.has(eb.id));
      for (const dbBullet of deletedBullets) {
        if (dbBullet.cvIds && dbBullet.cvIds.length > 0) {
          await prisma.experienceBullet.update({
            where: { id: dbBullet.id },
            data: { isArchived: true }
          });
        } else {
          await prisma.experienceBullet.delete({
            where: { id: dbBullet.id }
          });
        }
      }
    }

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      where: { id },
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
      where: { id },
    });

    loggers.app.info('Experience deleted', {
      userId: session.user.id,
      experienceId: id,
    });

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
