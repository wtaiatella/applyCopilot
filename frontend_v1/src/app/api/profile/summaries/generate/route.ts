import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import { AIService } from '@/lib/ai';
import {
  successResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { loggers } from '@/lib/logging';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new ValidationError('Unauthorized');
    }

    // Check rate limit for AI operations
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();
    const { instructions, summaryId } = body;

    if (!instructions || typeof instructions !== 'string') {
      throw new ValidationError('Instructions are required and must be a string');
    }

    // Find the profile of the current user
    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        experiences: { orderBy: { startDate: 'desc' } },
        education: { orderBy: { startDate: 'desc' } },
        projects: { orderBy: { startDate: 'desc' } },
        skills: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
      },
    });

    if (!profile) {
      throw new NotFoundError('UserProfile');
    }

    let existingContent: string | undefined;

    if (summaryId) {
      const existingSummary = await prisma.profileSummary.findUnique({
        where: { id: summaryId },
      });

      if (!existingSummary || existingSummary.profileId !== profile.id) {
        throw new NotFoundError('ProfileSummary');
      }

      existingContent = existingSummary.content;
    }

    loggers.ai.info('Generating profile summary with AI', {
      userId: session.user.id,
      profileId: profile.id,
      isRevision: !!summaryId,
    });

    const result = await AIService.generateProfileSummary(profile, instructions, existingContent);

    return successResponse(result);
  } catch (error) {
    loggers.ai.error('Failed to generate profile summary via API', { error: (error as Error).message });
    return handleApiError(error);
  }
}
